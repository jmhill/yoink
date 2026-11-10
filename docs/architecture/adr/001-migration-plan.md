# ADR-001 migration plan

- **Implements:** ADR-001 (modules, workflows, and edges). Contributes evidence to ADR-002 (module kit, deferred).
- **Progress:** tracked in `docs/PLAN.md` (phase "ADR-001 migration").
- **Supersedes:** the open items in `docs/PLAN.md` Phase 8.5 (8.5.4, 8.5.5, 8.5.6). Each is folded into a task below, as noted.

## How to use this plan

Each task can be handed to an agent on its own. Before starting a task, the agent reads:
1. `docs/architecture/adr/001-modules-workflows-edges.md` (the ADR; sections are cited as §n)
2. this plan's **Definition of done** and the task itself
3. the repo instructions: `AGENTS.md`, `apps/api/AGENTS.md`, `docs/conventions/CODESTYLE.md`, `docs/testing/TESTING.md`

Tasks list their dependencies. Tasks without a dependency between them may run in parallel, but **never** in parallel when both touch `composition-root.ts` or `app.ts`.

The [execution index](#execution-index) is the only status list: task keys, logical dependencies, serialization, status, release or human gates, and GitHub issue links. The row count is the table. It is not frozen at 78. Task sections below stay the work definition. A serialization edge is an execution rule for a shared file. It does not change the logical dependency written on the task.

## Definition of done (applies to every task)

1. **Releasable.** `pnpm quality` passes. If the task touches HTTP, auth, persistence or the composition root, `pnpm e2e:test` also passes.
2. **No behaviour change** unless the task says otherwise. Moves and renames preserve git history (`git mv`).
3. **Expand/migrate/contract.** A task never removes an old path, route, column or adapter that still has callers. Removal is its own task, or its own final step once callers are gone.
4. **Baselines never grow.** The ESLint warning count and the table-ownership allowlist (M1.2) must not increase. Shrink them where the task removes violations. The baselines are allowlist 6, API lint 5 warnings (`boundaries/element-types`), and web 32.
5. **Docs updated:**
   - mark the task in `docs/PLAN.md`
   - update `apps/api/AGENTS.md` if the task changes where things live
   - update the ADR if the task changes a decision (spikes especially)
6. **Lessons log.** Add an entry to ADR-002 §5 recording any repeated boilerplate or wiring pain. If nothing repeated, write the specific reason, not a bare "none".
7. **Tests follow `docs/testing/TESTING.md`.** New units get colocated tests. Moved code keeps its tests next to it.

## Phase overview

| Phase | Goal | Tasks |
|---|---|---|
| M0 | Adopt the ADRs, prove the risky mechanisms, take inventory | M0.1–M0.5 |
| M1 | Enforcement in place at `warn`, with baselines | M1.1–M1.3 |
| M2 | Kernel, platform and `edges/_shared` extracted (mechanical moves) | M2.1–M2.4 |
| M3 | All HTTP moved out of modules into edges; public API v1 and alias live | M3.1–M3.7 |
| M4 | Unit of work, integration events, and history as event sink | M4.1–M4.4, plus M4.1b |
| M5 | Modules migrated one at a time to the final module shape | M5.1–M5.13 |
| M6 | Client edges (extension, web, admin) | M6.1–M6.6 |
| M7 | Contract: retire legacy, enforce at `error`, review lessons | M7.1–M7.7 |

---

## M0: Adopt, prove, inventory

### M0.1 Adopt the ADRs into the repo

**Execution:** complete in `11da980`. No GitHub issue. Not reopened.

- **Depends on:** none
- **Do:**
  - Move `adr-001-modules-workflows-edges.md` → `docs/architecture/adr/001-modules-workflows-edges.md`, `adr-002-module-kit.md` → `docs/architecture/adr/002-module-kit.md`, and this plan → `docs/architecture/adr/001-migration-plan.md`.
  - Mark `docs/architecture/MODULAR_MONOLITH.md` and `docs/architecture/DOMAIN_EVENTS.md` **Superseded by ADR-001** (a status line at the top; keep the content).
  - In `docs/architecture/FUNCTIONAL_CORE.md`, replace the module layout and "What stayed out of this pilot" sections with a pointer to ADR-001. Keep the decide → plan → persist layer pattern.
  - In `apps/api/AGENTS.md`, replace the hexagonal-structure section with a summary of the target layout (ADR §3, §4) and a link to the ADR.
  - In `docs/PLAN.md`:
    - add a new phase, "ADR-001 migration", listing M0–M7 with each task's status
    - mark 8.5.4, 8.5.5 and 8.5.6 **Superseded**, with pointers (8.5.4 → M2.2 and M5.13; 8.5.5 → M1 and M7.5; 8.5.6 → M5.12)
    - update "Current Focus"
- **Accept:** docs only, with links working. No code changes.

### M0.2 Spike: unit-of-work batch guards (ADR §6.1, §12)

**Execution:** `M0.2`. Status is the execution index. There is no GitHub issue. The technical spike is complete. Measurements are in [the spike log](./spikes/README.md) and ADR §6.1. Local libsql evidence is also in [#303](https://github.com/jmhill/yoink/pull/303).

- **Depends on:** none
- **Do:** in a throwaway branch or test file, using the real `Database` abstraction, against local libsql **and** a Turso dev database:
  1. Create a guard table: `CHECK (ok = 1)`, owned by platform.
  2. In one `db.batch(..., 'write')`, run a conditional `UPDATE ... WHERE <condition>`, then `INSERT INTO <guard> (ok) VALUES (changes() > 0)`. Confirm:
     - the batch commits when the update matched
     - the **whole batch rolls back** when it didn't
  3. Confirm the batch error identifies the **index** of the failing statement (inspect `LibsqlBatchError` or the equivalent).
  4. Run a batch of about 1,000 task updates plus about 1,000 change-log inserts. Record its duration and any limits hit.
- **Output:** ADR §6.1 updated with the result. If U2 is confirmed, delete "Fallback" or keep it as history. If U2 fails, document U1 as the chosen implementation, with its rules. Also record the exact assertion SQL and the error-mapping approach.
- **Accept:** findings committed to the ADR. Production code unchanged.

### M0.3 Spike: oRPC contract and router spreading (ADR §9, §12)

**Execution:** `M0.3`. [#224](https://github.com/jmhill/yoink/issues/224). Status is the execution index. ADR §9 records the measured pattern. The throwaway runner is removed. No sanitized JSON report was committed. The historical source link is in §9.

- **Depends on:** none
- **Do:** with the pinned oRPC version (`2.0.0-beta.48`):
  - build a two-procedure contract `v1`, and `v2 = { ...v1, one: changed }`
  - implement both routers, spreading v1's implemented procedures into v2
  - mount v1 at `/api/v1` and again at `/api/` (as the alias), and v2 at `/api/v2`, on one Fastify instance
  - confirm typecheck passes, OpenAPI output is correct for each, and all three mounts serve requests
  - also confirm a per-request hook can add `Deprecation`, `Sunset` and `Link` headers on the alias mount only
- **Output:** ADR §9 updated, either with the confirmed pattern and a short code example, or with the fallback (list procedures explicitly per version).
- **Accept:** findings committed. Production code unchanged.

### M0.4 Route inventory (ADR §9)

**Execution:** `M0.4`. Done in [#301](https://github.com/jmhill/yoink/pull/301) ([#223](https://github.com/jmhill/yoink/issues/223)). That status is true when the pull request merges.

- **Depends on:** none
- **Do:** produce `docs/architecture/adr/001-route-inventory.md`. It's a table of **every** HTTP route registered by `app.ts`, with these columns:
  - method and path
  - current file
  - auth mode accepted (session / token / admin session / none / combined)
  - which clients call it (web, admin, extension, bots/tools, tests), found by searching `apps/web`, `apps/admin`, `apps/extension`, `tools/` and `packages/acceptance-testing`
  - classification: **integration** (→ v1 + alias), **client-only** (→ legacy until its client's edge), **ops**, **test fixture**
- **Accept:** every registered route is classified in `docs/architecture/adr/001-route-inventory.md` (integration 59, client-only 45, ops 1, test fixture 5, ambiguous 0). No open classification list. M3.1 copies every integration row unchanged, including `GET /api/auth/tokens`. M3.2 follows that classification and keeps today's combined auth on the `/api` alias. The four session-only token mutations stay client-only.

### M0.5 Refresh the ESLint baseline

**Execution:** `M0.5`. Done in `93584ce` ([#225](https://github.com/jmhill/yoink/issues/225)).

- **Depends on:** none
- **Do:** run `pnpm lint` and rewrite `docs/architecture/ESLINT_BASELINE.md` with the current counts per rule (about 112 `element-types`, 19 `no-unknown` and 33 `no-explicit-any` at last count), plus a short explanation of each group. Note that the module list is missing notes, review and work.
- **Accept:** the baseline matches `pnpm lint` output.

---

## M1: Enforcement at `warn`

### M1.1 Boundaries elements and rules for the target layout (ADR §10)

**Execution:** `M1.1`. [#226](https://github.com/jmhill/yoink/issues/226).

- **Depends on:** M0.5
- **Do:** in `apps/api/eslint.config.js`:
  - Register boundaries elements for **both** the current layout (so nothing is unknown) **and** the target layout (`edges/*`, `workflows/*`, `modules/*/{domain,application,infrastructure}`, `modules/*/index.ts`, `modules/*/testing.ts`, `kernel`, `platform`).
  - Add the ADR §10 rules 1–7 at `warn`:
    - layer direction
    - modules never import modules
    - entry points only (`index.ts`, `testing.ts` from tests)
    - workflow and edge import rules
    - kernel and platform rules
    - npm packages allowed per layer (`boundaries/external`)
    - `@yoink/api-contracts` limited to edges
  - Check the rule names and options against `eslint-plugin-boundaries` v5's documentation.
  - Keep the existing `no-restricted-imports` `error` rule (domain/application ↛ infrastructure).
- **Accept:**
  - `boundaries/no-unknown` = 0
  - the new warnings are recorded as the new baseline in `ESLINT_BASELINE.md`, grouped by rule
  - `pnpm quality` passes

### M1.2 Table-ownership architecture test (ADR §5.1, §10)

**Execution:** `M1.2`. [#227](https://github.com/jmhill/yoink/issues/227).

- **Depends on:** none
- **Do:**
  - Add `apps/api/src/platform/table-ownership.ts` (create `platform/` if needed) mapping each table to its owner, with **target** owners (task-management, history, …).
  - Add a test that runs as part of `pnpm test`. It scans non-test `.ts` files under `apps/api/src` for SQL (the heuristic in ADR §10) and maps each file to its owner, either by its target path or by a temporary path map for the current layout.
  - The test fails on any violation **not** in a checked-in **allowlist** (`table-ownership.allowlist.ts`). The allowlist must contain today's violations. Each entry has a comment naming the task that removes it.
  - The test also fails if any allowlist entry no longer matches (so a stale allowlist can't hide new violations), and if any `workflows/*/infrastructure/` directory exists.
- **Accept:** the test passes on the current code with the allowlist, and fails on a deliberately added violation (shown in the test's own tests).

### M1.3 Migration ownership (ADR §5.4)

**Execution:** `M1.3`. [#228](https://github.com/jmhill/yoink/issues/228).

- **Depends on:** M1.2
- **Do:**
  - Add `owner: ModuleName | 'platform'` to the `Migration` type. It's required for migrations numbered above `043`; `001`–`043` are exempt (make the field optional only for those, e.g. through a separate legacy type or an exemption list).
  - Extend the table-ownership test so new migrations may only touch tables their owner owns, unless they're `owner: 'platform'` with a non-empty `reason`.
  - Also fail on a new foreign key to another module's table, other than `organizations(id)` and `users(id)`.
- **Accept:** tests cover allowed and rejected migrations. Existing migrations are untouched.

---

## M2: Kernel, platform, `edges/_shared` (mechanical moves)

All M2 tasks are **moves plus import rewrites**, with no behaviour change. Use a codemod (for example ts-morph, or `git mv` plus a scripted rewrite of relative specifiers) rather than hand edits. Each task also updates the M1.1 element patterns and the M1.2 path map.

### M2.1 Create `kernel/`

**Execution:** `M2.1`. [#229](https://github.com/jmhill/yoink/issues/229).

- **Depends on:** M1.1
- **Move** (ADR §3.4, §3.5):
  - `shared/auth-context.ts`, `shared/name.ts` and `shared/domain/*` → `kernel/`
  - `listing/domain/*` and `listing/application/*` → `kernel/listing/`
  - `shared/change-log/application/command-log.ts` (`withCommandLog`) → `kernel/`
  - `CommandLogger` and `HistoryReadLogger` *types* (from `logging/`) → `kernel/`

  Add `kernel/module-name.ts` (the `ModuleName` union).
- **Accept:** kernel imports only kernel, `neverthrow` and `zod`, with no new lint warnings. `pnpm quality` passes.

### M2.2 Create `platform/` (closes the 8.5.4 health item)

**Execution:** `M2.2`. [#230](https://github.com/jmhill/yoink/issues/230).

- **Depends on:** M1.1
- **Move:**
  - `config/` → `platform/config/`
  - `database/` (including migrations) → `platform/database/`
  - `logging/` → `platform/logging/` (except the port types moved in M2.1)
  - `listing/infrastructure/page-sqlite.ts` and `sql-keyset.ts` → `platform/sql/`
  - the health checker → `platform/health/`
- **Change:** the health checker runs a plain connectivity query (`SELECT 1`) and no longer uses access's `TokenStore` (removes `TODO(8.5.4)`). This is the only behaviour change: `/api/health` responds the same way.
- **Accept:** `/api/health` acceptance and E2E checks pass. Fly's health path is unchanged.

### M2.3 Split `@yoink/infrastructure` (ADR §3.4)

**Execution:** `M2.3`. [#231](https://github.com/jmhill/yoink/issues/231).

- **Depends on:** M2.1, M2.2
- **Do:**
  - `Clock`, `IdGenerator` and `PasswordHasher` *types* are reachable from `kernel/`, either re-exported from a types-only entry of the package or moved into `kernel/`.
  - Implementations (real and fake) are imported only from platform, the composition root and tests.
  - Don't rename the package (deferred).
- **Accept:** no domain or application file imports a runtime value from `@yoink/infrastructure`. Lint shows this.

### M2.4 Create `edges/_shared/`

**Execution:** `M2.4`. [#232](https://github.com/jmhill/yoink/issues/232).

- **Depends on:** M2.1
- **Move:**
  - `shared/orpc/*` → `edges/_shared/orpc/`
  - `shared/request-validation.ts`, `shared/infrastructure/request-validation-http.ts` and `shared/infrastructure/parse-json.ts` → `edges/_shared/`
  - `shared/rate-limit-policy.ts`, `shared/request-client-ip.ts` and `shared/in-memory-rate-limit-consume.ts` → `edges/_shared/`
  - `listing/infrastructure/http-listed-page.ts` → `edges/_shared/`
  - `json-body.ts`, `trust-proxy.ts` and `static-cache-control.ts` → `edges/_shared/server/`
- **Note:** `lists/domain` and `projects/domain` import `request-validation`. They keep importing it from its new path (a lint warning). The import is removed in M5.4.
- **Accept:** `shared/` contains only `change-log/`, which moves in M4.2. `pnpm quality` and `pnpm e2e:test` pass.

---

## M3: HTTP out of modules, public API v1 live

### M3.1 Public API v1 contracts (frozen copy)

**Execution:** `M3.1`. [#233](https://github.com/jmhill/yoink/issues/233). Done on main (`198616d599acacd71b3e64203e62eb0ee5bc139d`, [#315](https://github.com/jmhill/yoink/pull/315)). The copy is `packages/api-contracts/src/public-api/v1/`. Each contract path is the legacy path with `/api` removed. M0.3 showed that a path containing `/api/v1` matches only that URL, so the `/api/v1` root is the prefix M3.2 passes to `handle`. The public URL is still `/api/v1` plus the resource path. The 59 integration rows are included. The 45 client-only rows, health, and the five fixtures are not. `GET /api/auth/tokens` is included. Token create, token delete, agent mint, and member token reissue are not. v1 input and output schemas are detached Zod copies of today's schemas. They do not share objects with the live legacy schemas. Array length bounds (`minLength`, `maxLength`, `exactLength`) are copied objects, so editing the legacy bound object does not change v1. `frozen-shape.json` pins methods, resource paths, OpenAPI metadata, procedure error maps, and the structural shape of those schemas. Zod's `optional()`, `nullable()`, and the other wrappers that pass a definition through `processCreateParams` install one library error-map function. Its source text is the same on every wrapper and is not a contract message, so the pin does not store it. A schema error map is pinned only when it returns a message other than Zod's default. A later edit of a legacy schema changes the derived copy and fails that pin until the JSON is updated on purpose. Refinement predicates are pinned by safeParse cases, because their function source is not part of the shape. Comparing a v1 schema to the live legacy object is not the freeze: both would move and the test would stay green. This task does not mount a route and does not add an OpenAPI Zod converter.

- **Depends on:** M0.3, M0.4
- **Do:** create `packages/api-contracts/src/public-api/v1/` containing the contracts of every **integration** route from the inventory, **copied unchanged** in path suffix, shapes and errors. The suffix is the contract path (`/captures`). `/api/v1` is the mount prefix M3.2 passes to `handle`, because M0.3 showed a path that already contains `/api/v1` matches only that URL. Today's `orpc/` contracts stay as they are (legacy).
- **Accept:** a contract test pins each v1 procedure's method, resource path, OpenAPI metadata, error map, and input and output shape in `frozen-shape.json`, independently of the live legacy schema objects. The v1 schemas do not share Zod objects with those legacy schemas.

### M3.2 `edges/public-api/v1/` mounted at `/api/v1` and the `/api` alias

**Execution:** `M3.2`. [#234](https://github.com/jmhill/yoink/issues/234). Done on main (`0a1b7aa7b4d532663c7cd27194bba82cd3527a31`, [#317](https://github.com/jmhill/yoink/pull/317)). `app.ts` calls `registerPublicApiV1` instead of the seven legacy integration registrars. All 59 frozen procedures, including `GET /auth/tokens`, are served at token-only `/api/v1` and at the `/api` alias. The alias sets `Link` to the v1 successor. `aliasRetirement` is unset, so `Deprecation` and `Sunset` are absent until M7.1 records a real window of at least 90 days. An explicit window of at least 90 days can be passed for that announcement. No production date is invented, and the 90-day clock has not started. Token create and delete stay on `registerTokenMutationRoutes`, with no versioned path and no alias headers. `/api/health` and the fixture routes stay for M3.4. M3.3 moves admin, session, auth, passkey, signup, invitation, organization, and token writes to `edges/legacy/` at the same paths and the same auth. A bot actor's token id is logged. A human token's actor has no token id, so this is not per-token evidence for human tokens, and the bearer secret is not logged. The edge does not add a token id to the actor. No route uses the unit of work. The recorded baseline in `docs/architecture/ESLINT_BASELINE.md` stays 177 and is not rewritten. Live API lint on this mount is 0 errors and 175 warnings (`boundaries/element-types` 142, `@typescript-eslint/no-explicit-any` 33). Before the mount the live count was 209. A captured `edge: public-api` allow retargets the previously legal module imports (captures, lists, notes, review, tasks, work, history) and names M5.1, M5.2, M5.3, M5.7, M5.10, and M5.10-history. It does not allow projects, processing, or access. Deleting the seven unused registrar files removes their edge imports and their pre-existing access imports. Deleting `registerTokenRoutes` removes the access-to-edge import. The capture handler stub tests moved to `src/tests/`, which the tests element may import, and that drops two pre-existing captures-test warnings (access and processing). 209 − 17 allowed same-element and history imports − 14 retired registrar warnings − 1 retired access-to-edge import − 2 relocated test warnings = 175. Nine warnings stay visible on the public-api edge: captures to processing, captures to projects, four projects-module imports, and three token-list imports from access. The captures debts stay visible. The four projects imports stay warnings until a narrower rule can name them without also allowing that captures debt. No inline disables.

- **Depends on:** M3.1, M2.4
- **Do:**
  - Implement the v1 router by **moving** today's integration route handlers (`*-routes.ts` for captures, tasks, lists, projects, notes, work, review and history, as classified in the inventory) into `edges/public-api/v1/`. Temporarily they still call module handlers and services by deep import; that's allowed with a lint warning and an allowlist comment pointing to the M5 task that fixes it.
  - Mount at `/api/v1` with **token-only** auth.
  - Mount the same router at `/api/` as the alias, with **today's auth** (combined session plus token, because the web app still calls these paths).
  - The alias adds `Deprecation`, `Sunset` and `Link` headers. Leave the sunset date unset until M7.1, or use a far-future placeholder.
- **Usage logging:** through `edges/_shared/`, each request's log context includes the token id (when present), the API version, and whether the request came through the alias (ADR §9).
- **Accept:**
  - every existing acceptance test passes unchanged (they use the alias)
  - new acceptance tests show `/api/v1/...` works with a token and rejects session-only requests
  - the alias responds with deprecation headers

### M3.3 `edges/legacy/` for client-only routes

**Execution:** `M3.3`. [#235](https://github.com/jmhill/yoink/issues/235). Done on main (`0959d7d6d4f855a74331f08a485d8dd6a72321cf`, [#320](https://github.com/jmhill/yoink/pull/320)). The client-only registrars now live in `apps/api/src/edges/legacy/`: admin, auth, passkey, signup, invitation, organization, and token writes. Paths and auth are unchanged. They are not aliased into v1. `Deprecation` and `Sunset` stay unset. M3.4 moves health to `edges/ops/` and the fixture routes to `edges/test-fixtures/` at `/test-api/`. Colocated HTTP tests stay in `access/application/` until M3.6 and import these registrars. Live API lint stays 0 errors and 175 warnings. The recorded baseline is not rewritten. A captured `edge: legacy` allow names access, and access may import this edge. Other edges stay disallowed.

- **Depends on:** M0.4, M2.4
- **Do:** move every **client-only** route (admin, auth, passkey, signup, invitation, organization settings, …) out of `access/application/` and the other modules into `edges/legacy/<area>/`, keeping **identical paths and auth**. These later move to their client's edge (M6) and are removed (M7).
- **Accept:** no route file remains under any module's `application/` or `infrastructure/`. `pnpm e2e:test` passes. Issue #235 keeps health and the fixture routes until M3.4, so this task's accept is that every client-only route file has left its module. Paths and auth stay identical.

### M3.4 `edges/ops/` and `edges/test-fixtures/`

**Execution:** `M3.4`. [#236](https://github.com/jmhill/yoink/issues/236). Done on main (`67e24d6b4e5d5f76db883679cf3cf6983ff4c598`, [#321](https://github.com/jmhill/yoink/pull/321)). `GET /api/health` is served from `apps/api/src/edges/ops/orpc-health-routes.ts`. The five fixture routes are served from `apps/api/src/edges/test-fixtures/` at `/test-api/...`. Nothing is served at `/api/test/` for those routes. `/test-api` is on the SPA not-found list and the PWA denylist, and the web and admin dev proxies forward it. `/admin-api` is not treated as the admin app. `/web-api`, `/admin-api`, and `/extension-api` are not mounted. `edges/test-fixtures/` is exempt from table ownership, and the three review-fixture allowlist rows are gone. Live API lint is 0 errors and 174 warnings. The recorded baseline stays 177 and is not rewritten. The warning that left is the review fixture importing access: that file is now the test-fixtures edge, which may import access. `boundaries/element-types` is 141 and `@typescript-eslint/no-explicit-any` is 33. `Deprecation` and `Sunset` stay unset.

- **Depends on:** M2.2, M3.3
- **Do:**
  - Move the health route to `edges/ops/`. The path stays `/api/health`.
  - Move `http-review-fixture-routes` and `http-ownerless-workspace-fixture-routes` to `edges/test-fixtures/`, re-rooted at `/test-api/...`.
  - Update `packages/acceptance-testing/src/drivers/http/{admin,actor}.ts` and `drivers/playwright/actor.ts` to the new paths.
  - Exempt `edges/test-fixtures/` in the table-ownership test.
  - Register `/test-api` in the SPA fallback (`app.ts`), in the PWA `navigateFallbackDenylist` (`apps/web/src/lib/pwa-navigate-fallback`), and in the dev proxies if the tests use them.
- **Accept:** `pnpm e2e:test` passes. Nothing is served at `/api/test/` any more.

### M3.5 Auth middlewares to `edges/_shared/`

**Execution:** `M3.5`. [#237](https://github.com/jmhill/yoink/issues/237). Done on main (`f422e83d14b1bb066f461d406b0b6eeaf9b821f6`, [#322](https://github.com/jmhill/yoink/pull/322)). `auth-middleware`, `user-session-middleware`, `admin-session-middleware`, `combined-auth-middleware`, `with-authenticated-rate-limit`, and `access-http-errors` live in `apps/api/src/edges/_shared/auth/`. The error map moved with them so access production has no `@orpc` import. An `edge-auth` element may import access until M5.13. The rest of `edges/_shared` may not. Access production is banned from Fastify and oRPC, and lint shows none of those imports. HTTP tests stay in access until M3.6. Combined auth is still session, then bearer. Who is accepted on each current path is unchanged. The web token fallback stays until M7.3, and M7.3 stays outside this migration until PLAN 7.7c. Cookie `path` stays `/` and `sameSite` stays `strict`. Rate-limit numbers are unchanged. Public API and the legacy web routes still share one authenticated bucket (`globalMax` 600 per minute) from `rate-limit-policy.ts`. Admin login (5 per 15 minutes), auth login (10 per 15 minutes), and signup (5 per hour) stay on those edges. Splitting the authenticated bucket would raise the effective limit, so it stays shared. Live API lint is 0 errors and 173 warnings (`boundaries/element-types` 140, `@typescript-eslint/no-explicit-any` 33). The warning that left is `edges/public-api/v1/tokens.ts` no longer importing `access-http-errors` from access. The recorded baseline stays 177 and is not rewritten. `Deprecation` and `Sunset` stay unset.

- **Depends on:** M3.2, M3.3
- **Do:** move `auth-middleware`, `user-session-middleware`, `admin-session-middleware`, `combined-auth-middleware` and `with-authenticated-rate-limit` from `access/application/` to `edges/_shared/auth/`. They depend on access through its current services; that's allowed by allowlist until M5.13 provides an access interface. Rate-limit configuration becomes per edge (ADR §8.1).
- **Accept:** access contains no Fastify or oRPC imports. Lint shows this.

### M3.6 Retire HTTP tests from module folders

**Execution:** `M3.6`. [#238](https://github.com/jmhill/yoink/issues/238). Done. Status is the execution index. The HTTP tests have moved. The health HTTP adapter is `apps/api/src/edges/ops/orpc-health-errors.ts`. `apps/api/src/health` is gone. `platform/health` still returns `ResultAsync<HealthStatus, HealthCheckError>`. HTTP tests now sit next to the edge routes they exercise. That is the 22 `http-*.test.ts` and `orpc-*.test.ts` files, plus the eight access tests whose names do not match that pattern (`auth-middleware`, `combined-auth-middleware`, `user-session-middleware`, `admin-session-middleware`, `auth-routes`, `passkey-routes`, `organization-routes`, `token-routes`), plus `task-list-pagination.test.ts`, which drives task-list HTTP. Handler tests (`handle-*`), domain tests, and store tests stayed in the modules. Auth middleware tests are element `edge-auth-test`: they may import access fakes and `@yoink/infrastructure`. Other `edges/_shared` tests stay `edge-test` and still cannot import access. Production public-api still does not allow projects, processing, access, or platform-database, so those route-file warnings stay. Live API lint is 0 errors and 150 warnings (`boundaries/element-types` 117, `@typescript-eslint/no-explicit-any` 33). The warnings that left were HTTP tests in module folders importing the shared test helper. The recorded baseline stays 177 and is not rewritten. No route path, auth check, or alias date changed. `Deprecation` and `Sunset` stay unset.

- **Depends on:** M3.2–M3.5
- **Do:** move the `http-*.test.ts` and `orpc-*.test.ts` files that remained in module folders next to the routes they test, under `edges/`.
- **Accept:** no module directory contains HTTP tests.

---


### M3.7 Remove test-helper SQL ownership exceptions

**Execution:** `M3.7`. [#326](https://github.com/jmhill/yoink/issues/326). Done. Allowlist move [#324](https://github.com/jmhill/yoink/pull/324). Filename correction [#338](https://github.com/jmhill/yoink/pull/338) (`a93e1bc16f1c1cd99ee367eaeb44f07f914c0635`). Status is the execution index.

- **Depends on:** M1.2
- **Do:** restore `migration-seed` and `seed-test-user-session` to non-test filenames. Remove the two Vitest collection excludes. Document an explicit `src/tests/helpers/**` test-support exemption, and cover it with a self-test. A `*.test.ts` file without a test suite is not allowed. The platform migration runner keeps its seed callback and does not import tests. Do not add a production exemption. ADR-002 records the lesson.
- **Accept:** the helpers are not named `*.test.ts`. Vitest does not exclude them. The exemption is documented and covered by a self-test. No `*.test.ts` lacks a test suite. The allowlist does not grow.

Shipped in [#324](https://github.com/jmhill/yoink/pull/324): the helpers were `migration-seed.test.ts` and `seed-test-user-session.test.ts`, Vitest excluded those two paths, and the scanner skipped `*.test.ts`. Allowlist 43 rows to 33. The 10 `removedBy: 'M7.5'` rows were removed, not retargeted. The file had 10, not 21. That filename shape is history. The Do above replaces it.


### OPENAPI-V1 Evaluate a Zod 3 converter before promoting `/api/v1`

**Execution:** `OPENAPI-V1`. [#329](https://github.com/jmhill/yoink/issues/329). Done on main (`30f08e333c45e7e7292955fa877c702fbef6374a`, [#334](https://github.com/jmhill/yoink/pull/334)). [#329](https://github.com/jmhill/yoink/issues/329) is closed completed. The Zod 3 converter describes public v1 request, response, and representative error schemas. It does not upgrade oRPC or Zod.

- **Depends on:** M3.2
- **Do:** the published public v1 OpenAPI spec currently emits empty schemas because no Zod converter is installed. Evaluate a converter that works with Zod 3 and oRPC `2.0.0-beta.48`. Show usable request and response schemas, including errors and optional or nullable fields, and add coverage for the generated spec. Preserve frozen v1 runtime contracts. Escalate any ADR text change beyond the spike evidence.
- **Accept:** the compatibility result is recorded. ADR-002 gets one observation, or a specific reason none arose. M7.1 does not start until this task is done.

### TOKEN-LIST Confirm integration token listing and pin public v1

**Execution:** `TOKEN-LIST`. [#327](https://github.com/jmhill/yoink/issues/327). Done on main (`dc7da8044357eda0887f9a9fc7e86acb002b3a58`, [#340](https://github.com/jmhill/yoink/pull/340)). [#327](https://github.com/jmhill/yoink/issues/327) is closed completed. Justin approved this on 2026-11-07 at 21:45 CST. The tests pin that decision. Runtime behavior is unchanged.

- **Depends on:** M3.2
- **Do:** `GET /api/auth/tokens` lists the authenticated principal's own non-revoked token metadata within the organization, including sibling tokens. It is not a whole-organization inventory. The fields are `id`, `name`, optional `lastUsedAt`, and `createdAt`. The response never includes a hash or a raw secret. `/api/v1` stays bearer-only. The `/api` alias keeps session or bearer. Session-only create, revoke, and reissue stay unchanged. Integration and acceptance tests cover both routes.
- **Accept:** the listing decision is approved and the tests pin today's behavior. The route is unchanged. ADR-002 records why this did not add a module-kit helper.

### LINT-ACCEPTANCE Fix acceptance-test lint and decide CI coverage

**Execution:** `LINT-ACCEPTANCE`. [#328](https://github.com/jmhill/yoink/issues/328). Done. Status is the execution index.

- **Depends on:** M0.5
- **Do:** the live lint before the fix was 4 errors and 0 warnings, all `@typescript-eslint/no-unused-vars`: `staged`, `mineMilk`, `eggs`, `bread`. Those unused bindings are dropped and the awaited calls stay. `pnpm quality` lints every package, including `@yoink/acceptance-tests`, then runs build, typecheck, and test with `--filter=!@yoink/acceptance-tests`. PR and trunk Quality Checks run that script. The browser suite stays in the CI E2E job. Do not rewrite `docs/architecture/ESLINT_BASELINE.md`.
- **Accept:** the four errors are gone. The historical 177 census tables are unchanged. The acceptance suite is not part of `pnpm quality`. ADR-002 records why this is not a module-kit change.

## M4: Unit of work, integration events, history as sink

### M4.1 Kernel unit-of-work types, plus SQLite and in-memory implementations

**Execution:** `M4.1`. [#239](https://github.com/jmhill/yoink/issues/239). Done on main (`e0fc57687d8de09b0da3d9d22871007e6255d58f`, [#314](https://github.com/jmhill/yoink/pull/314)). The SQLite unit of work is U1 (`client.transaction('write')`). There is no guard table. The Do line that maps errors by statement index is the U2 path and does not apply. Conflict is a guarded write with `rowsAffected === 0` and that step's owner. Storage is a thrown execute on the awaited step. The U1 Turso report's `foreignKeys: null` stays a column-name bug in that report. The sqlite file test reads `PRAGMA foreign_keys` on column `foreign_keys`, observed 1, and a dangling reference insert rolls back as Storage for that step. Nothing in the app calls the unit of work yet.

- **Depends on:** M0.2, M2.1, M2.2
- **Do:**
  - Add the kernel types from ADR §6.1 and §6.3 (`Step`, `StepFailure`, `Work`, `UnitOfWork`, `SqlParticipant`, `FakeParticipant`, `GuardedStatement`, `Policy`) and the `IntegrationEvent` envelope (§7.1).
  - Add `platform/unit-of-work/`:
    - the SQLite implementation (participant registry, batch assembly, guard assertions, mapping errors back by statement index)
    - the in-memory implementation (snapshot and restore across fake participants)
    - a platform-owned migration for the guard table (`owner: 'platform'`)
  - Use whichever implementation M0.2 chose.
- **Accept:** unit tests for both implementations cover commit, guard failure (with typed `Conflict` and the right `owner`), a storage failure, rollback of every participant, and policies (one level only, refusal aborts the commit). Nothing uses it yet.


### M4.1b U1 with one batch inside the transaction

**Execution:** `M4.1b`. [#325](https://github.com/jmhill/yoink/issues/325). Done on main (`db30c3872b1c4a5855d285d49f6526fec418e085`, [#336](https://github.com/jmhill/yoink/pull/336)). The remote spike passed. Justin approved the ADR §6.1 batch contract. `sqlite-unit-of-work.ts` sends one `tx.batch` inside `transaction('write')`. M5.3 is Done. M5.5 is Done (#373, `8903adaf`, Trunk 42822389879).

- **Depends on:** M4.1
- **Do:** the remote spike has passed. Its report is in the spike log. Do not rerun it, the M0.2 runners, or anything against production. Performance, per-statement `rowsAffected`, and rollback stand. HTTP fetches were 2 per batch, not 3. The historical U2 times are approximate. Switch `sqlite-unit-of-work.ts` to one `tx.batch` inside `transaction('write')` and classify with the approved `StepFailure`. `Conflict.owner` comes from the guarded statement's position in the result. `Storage.owner` is set only when every statement has that owner. `owners` is always every module in the batch. A mixed throw has no `owner`. There is no `owner: null`. No caller branches on `Storage.owner`. An expected conflict is a guard (`UPDATE … WHERE …` or `INSERT … SELECT … WHERE NOT EXISTS`) and `rowsAffected === 0`. A throw during commit is `Storage`. The edge returns 500 and may retry. Do not re-execute the failed batch one statement at a time. Log the driver cause, `owners`, and the batch size, with the raw message redacted so SQL arguments and secrets do not leak.
- **Accept:** the tests landed with [#336](https://github.com/jmhill/yoink/pull/336): a mixed-owner guard miss with the right `Conflict` owner, a single-owner throw as `Storage` with `owner` and `owners`, and a mixed-owner throw as `Storage` with no `owner` and with `owners`. All three roll back. A local libsql batch has at least 2,000 statements. M5.3 is Done. M5.5 is Done (#373, `8903adaf`, Trunk 42822389879). ADR-002 records the wiring.

### M4.2 Create `modules/history/` and move the change log

**Execution:** `M4.2`. [#240](https://github.com/jmhill/yoink/issues/240). Done on main (`a445f0ec62bbe822c770eb2cefc4b9a8aa1423fc`, [#316](https://github.com/jmhill/yoink/pull/316)). Gate: none. `shared/` is removed. `modules/history/` holds the change log and the timeline, with `index.ts` and `testing.ts`. The composition root constructs history handlers and the sqlite change-log store from those paths. It does not register a unit-of-work sink.

- **Depends on:** M4.1, M2.4
- **Do:**
  - Move `shared/change-log/domain/*` and `infrastructure/*` into `modules/history/`, along with the current `history/` module.
  - Give history an `index.ts` and `testing.ts`.
  - Move `HIDDEN_CHANGE_LOG_KINDS` and `countsTowardLastChanged` into history's domain.
  - Other modules keep calling `insertChangeLogQuery` from its new path for now, tracked in the allowlist with a pointer to their M5 task.
- **Accept:** `shared/` is gone. `pnpm quality` and `pnpm e2e:test` pass.

### M4.3 History as the event sink

**Execution:** `M4.3`. [#241](https://github.com/jmhill/yoink/issues/241). Done on main (`eb4fcf4ae007d178b2b9346ebf1c03880da374a6`, [#318](https://github.com/jmhill/yoink/pull/318)). The composition root registers one empty history sink (`createHistoryEventSink` with `EMPTY_EVENT_SINK_MAP`) on both `createSqliteUnitOfWork` and `createInMemoryUnitOfWork`. `openDatabase` returns one libsql client, and the sqlite unit of work uses that same write client. `BootstrappedApp` exposes `unitOfWork` and `inMemoryUnitOfWork`. No route uses the unit of work yet. M4 stays open. M4.4 remains.

- **Depends on:** M4.2
- **Do:**
  - Implement history's event-sink participant: **prepare** maps integration events to timeline records and assigns ids with `IdGenerator`; **compile** turns records into `change_log` inserts. Provide a fake participant too.
  - Start a mapping table from integration event `type` to record builder. It's empty until modules publish events in M5.
  - Register the sink with both unit-of-work implementations in the composition root.
- **Accept:** a test publishes a sample integration event through the unit of work and finds the expected `change_log` row (SQLite) or fake record.

### M4.4 Remove guards that read across modules (finishing step)

**Execution:** `M4.4`. [#242](https://github.com/jmhill/yoink/issues/242). In review ([#381](https://github.com/jmhill/yoink/pull/381)).

- **Depends on:** all M5 module tasks that remove their callers of `existsClause` and `insertChangeLogIfChangedQuery`
- **Do:** delete `existsClause` and any `EXISTS (SELECT … FROM <another module's table>)` guard left in history's SQL.
- **Accept:** there are no history allowlist entries in the table-ownership test.

---

## M5: Modules, one at a time

**Standard module checklist.** Every M5 module task completes all of these steps unless the task says otherwise. Reviewers check each one.

1. **Location and buckets.** Move to `modules/<name>/` and apply the folder buckets (ADR §4.2) when a layer has more than about 10 non-test files. Remove layer barrels.
2. **Entry points.** `index.ts` exports only the factory and the published types. `testing.ts` exports the fake-backed factory and the fake participants.
3. **Public interface.** `create-<module>.ts` builds `{ commands, queries, prepare }` (ADR §4.3). Commands are named by intent. Every command is prepare, then `uow.commit`. Only publish the `prepare` functions that some workflow or policy uses.
4. **Persistence participants.** An `SqlParticipant` (plan → guarded statements) and a `FakeParticipant`. Hand-written snapshot and restore code in fakes is removed. Port contract tests move to `infrastructure/`.
5. **Integration events.** Types and mappers in `application/integration-events/`, consumed by history's sink. The module's `change-log-records.ts` moves into history's mapping table. Record ids are no longer generated by handlers. The timeline output (verified by the existing history tests) is unchanged.
6. **Consumer-owned ports.** Every read from another module goes through a port in `application/ports.ts` with only the fields it needs, adapted in the composition root (ADR §4.4). No imports from other modules.
7. **Edges switch to the interface.** Routes in `edges/public-api/v1/` and `edges/legacy/` that used this module's handlers or services by deep import now go through `index.ts`.
8. **Allowlists shrink.** Remove this module's table-ownership allowlist entries and its lint warnings. A module that still imports `@yoink/api-contracts` stays on a current ESLint element (`src/modules/<name>/**`, mode full, declared before the target `module-*` patterns) until its M5.11 task. Turning those target rules on adds one warning per contract import. Do not add a blanket `@yoink/api-contracts` allow on `module-domain` to hide that. Keep the old `src/<name>/**` pattern while a boundary fixture still uses it.
9. **Docs.** `docs/PLAN.md`, plus ADR §6.4 if any operation's classification changes.

Own types (dropping `@yoink/api-contracts` from domain and application) are a **separate task per module** (M5.11), so the module moves stay reviewable. A legacy store method another module still calls stays until that caller moves. The new participant does not replace that method in this task.

### M5.1 Captures (pilot)

**Execution:** `M5.1-check` (history `subject_type` CHECK, same release, before the first capture event) and `M5.1`. [#246](https://github.com/jmhill/yoink/issues/246), [#247](https://github.com/jmhill/yoink/issues/247). Status is the execution index. Migration 044 lets `change_log.subject_type` be `capture` beside task, list, project, and note. M5.1 is done on main (`72780cac9169dd24ab1403ae69395da72f9ee253`, [#343](https://github.com/jmhill/yoink/pull/343)). M4.1b is done on main (`db30c3872b1c4a5855d285d49f6526fec418e085`, [#336](https://github.com/jmhill/yoink/pull/336)). M3.7 is done on main (`a93e1bc16f1c1cd99ee367eaeb44f07f914c0635`, [#338](https://github.com/jmhill/yoink/pull/338)). Its dependencies are done.

- **Depends on:** M3.6, M4.3, M5.1-check, M4.1b
- **Do:** the standard checklist. Publish `prepare.markProcessed` (with the inbox-claim guard) and `prepare.deleteProcessedCapture` for the processing workflow and policy. `queries.findInboxCapture` is needed by processing.
- **Accept:** the standard checklist is complete. This pilot's lessons go into ADR-002 §5 **in detail**, and the plan template above is refined if the pilot shows a better shape.

### M5.2 Task Management: structural merge (no behaviour change)

**Execution:** `M5.2`, after `CL-WORK`. [#248](https://github.com/jmhill/yoink/issues/248), [#243](https://github.com/jmhill/yoink/issues/243). Status is the execution index. `CL-WORK` is done: Justin adopted option 1 on 2026-11-09 at 10:43am CST ([#243](https://github.com/jmhill/yoink/issues/243#issuecomment-6745725026)). M5.2 is Done ([#352](https://github.com/jmhill/yoink/pull/352), `4c4b28bb`, Trunk [42701505987](https://github.com/jmhill/yoink/actions/runs/42701505987)).

- **Depends on:** M5.1
- **Do:**
  - Move `tasks/`, `projects/` and `lists/` into `modules/task-management/` with buckets.
  - Unify their errors and ports where they're duplicates. Calls between tasks, projects and lists become internal.
  - Move `work/`'s queries (next actions, due, work lists) and `now-order.ts` into task-management queries. Keep the `/api/work/*` routes in `edges/public-api/v1/`, now calling task-management queries.
  - Delete the `work/` module.
- **Scope note:** this task covers checklist steps 1, 2, 7 and 8 only. Steps 3–6 are M5.3.
- **Accept:** every task, project, list and work acceptance test passes unchanged.

### M5.3 Task Management: interface, unit of work, events

**Execution:** `M5.3`. [#249](https://github.com/jmhill/yoink/issues/249). Done ([#361](https://github.com/jmhill/yoink/pull/361), `954619ed`, Trunk [42731265947](https://github.com/jmhill/yoink/actions/runs/42731265947)).

- **Depends on:** M5.2, M4.1b
- **Do:** checklist steps 3–6:
  - Persistence for tasks, projects, lists and project imports goes through participants. That includes the "project done completes open tasks" path (up to `OPEN_TASKS_FETCH_LIMIT`) and imports, both as one commit.
  - Publish `prepare.createTask` and `prepare.createProject` (from a `TaskStarter` / `ProjectStarter` document) for processing.
  - `TaskDeleted` carries `source: { kind: 'capture', id }` when the task came from a capture.
  - The assignee check uses a consumer-owned port adapted to access (an interim adapter over today's access store until M5.13).
- **Accept:** standard checklist complete. Large-batch behaviour is covered by a test using the SQLite unit of work.

### M5.4 Task Management: legacy services and the domain importing HTTP code

**Execution:** `M5.4`. [#250](https://github.com/jmhill/yoink/issues/250). `M5.4` is Done (#375, `300dd1f3`, Trunk 42845309412). #250 is closed.

- **Depends on:** M5.3
- **Do:**
  - Migrate `tasks/domain/task-service.ts` (whatever remains, e.g. pin and delete paths) to decide → plan → participant.
  - Remove the domain's imports of `edges/_shared/request-validation`: validation errors become domain refusals, and edges map them.
  - Remove the store-object interfaces (`task-store.ts`, `project-store.ts`, `list-store.ts`) from the public surface. They're internal to persistence, or deleted.
- **Accept:** no `domain/services/` or `domain/ports/` in task-management. No lint warnings for task-management except the `@yoink/api-contracts` ones, which M5.11 handles.

### M5.5 Processing workflow and delete-source-capture policy

**Execution:** `M5.5`. [#251](https://github.com/jmhill/yoink/issues/251). `M5.5` is Done (#373, `8903adaf`, Trunk 42822389879).

- **Depends on:** M5.1, M5.3, M4.1b
- **Do:**
  - Move `processing/` to `workflows/processing/` with `domain/`, `application/`, `policies/` and `index.ts`, and **no `infrastructure/`**.
  - Rewrite process-to-task and process-to-project as pipelines: query → prepare in Task Management (`TaskStarter`) → prepare a capture claim → one `uow.commit` (ADR §6.2).
  - Delete `persist-process.ts`, `process-row-statements.ts` and the cross-module fake persist adapters.
  - Implement the **delete-source-capture** policy (ADR §6.3) and register it in the composition root. Remove `softDeleteCaptureQuery` from task-management's SQL.
  - Migrate `processing-service.ts` (legacy) away.
- **Accept:**
  - processing acceptance tests pass, including the race (a capture processed twice → second attempt gets a `Conflict`)
  - deleting a task that came from a capture still soft-deletes the capture, through any edge
  - the table-ownership test shows no captures, tasks or projects SQL outside their owners

### M5.6 Remove `tasks.capture_id → captures` foreign key

**Execution:** `M5.6`. [#252](https://github.com/jmhill/yoink/issues/252).

- **Depends on:** M5.5
- **Do:** a task-management-owned migration that rebuilds `tasks` without the foreign-key constraint (using `table-rebuild`), keeping the `capture_id` column as an opaque id. Migration tests cover it.
- **Accept:** migration test passes. Behaviour unchanged.

### M5.7 Notes

**Execution:** `M5.7`. [#253](https://github.com/jmhill/yoink/issues/253). `M5.7` is Done (#376, `4ae674c1`, Trunk 42854951002).

- **Depends on:** M5.3
- **Do:**
  - The standard checklist.
  - Project lookups and actor and person lookups go through consumer-owned ports (Task Management and access).
  - Move `notes/test-support/fake-notes-backend.ts` into `infrastructure/fakes/`.
- **Accept:** standard checklist complete.

### M5.8 Notes settings table and the mirror-bot column

**Execution:** `M5.8a` create, `M5.8b` backfill, `M5.8c` switch (keep today's environment fallback), `M5.8d` drop in a later release. [#254](https://github.com/jmhill/yoink/issues/254), [#255](https://github.com/jmhill/yoink/issues/255), [#256](https://github.com/jmhill/yoink/issues/256), [#257](https://github.com/jmhill/yoink/issues/257). `M5.8a` ([#254](https://github.com/jmhill/yoink/issues/254)) is Done (#380, `d057cb15`, Trunk 42878712223). `M5.8b`, `M5.8c`, and `M5.8d` are not.

- **Depends on:** M5.7
- **Do:** expand/migrate/contract, one step per commit:
  1. A notes-owned migration creates `notes_settings`.
  2. Backfill it from `organizations.notes_mirror_bot_user_id`.
  3. Switch reads and writes to `notes_settings`. `load-notes-mirror-bot.ts` stops writing `organizations`.
  4. An access-owned migration drops the old column, in its own commit after a release.
- **Accept:** notes import and mirror-bot acceptance tests pass at every step.

### M5.9 Remove `project_notes.project_id → projects` foreign key

**Execution:** `M5.9`. [#258](https://github.com/jmhill/yoink/issues/258).

- **Depends on:** M5.7
- **Do:** a notes-owned migration rebuilding `project_notes` without the constraint. Deleting a project (if possible) or changing its status no longer depends on notes rows.
- **Accept:** migration test passes. Behaviour unchanged.

### M5.10 Review and history (queries)

**Execution:** `M5.10-review` and `M5.10-history`. `CL-REVIEW` is done: Justin adopted option 1 on 2026-11-09 at 10:43am CST ([#244](https://github.com/jmhill/yoink/issues/244#issuecomment-6745725813)). `M5.10-review` ([#259](https://github.com/jmhill/yoink/issues/259)) is merged (#379, `ea48d512`), Trunk pending. [#244](https://github.com/jmhill/yoink/issues/244), [#260](https://github.com/jmhill/yoink/issues/260).

- **Depends on:** M5.3, M4.3
- **Do:**
  - **Review** gets the standard checklist. Review owns the attention policy: classification, section order, and queries. It consumes Task Management, history, and access ports. Task Management exposes project, next-action, and completed-task facts in its own terms, not a query shaped as what Review needs. History supplies last-change facts. Access supplies the organization time zone. The web `/projects` screen and public `GET /review`, `GET /review/done`, and the `/api` aliases share one Review query. There is no cross-module SQL, and no new Review table just to establish ownership. The attention keyset stays. The done-list keyset stays `(completedAt, task id)`. Edges never re-sort a paginated result. The review fixture routes stay in `edges/test-fixtures/` (see M7.4).
  - **History** gets the standard checklist for its queries. Lookups for task, project, note and user names go through consumer-owned ports instead of reading `tasks`, `projects`, `project_notes` and `users`.
- **Accept:** no review or history SQL touches another module's tables. Standard checklist complete.

### M5.11 Own types per module (repeat for each module)

**Execution:** one issue per module: `M5.11-captures`, `M5.11-task-management`, `M5.11-notes`, `M5.11-review`, `M5.11-history`, `M5.11-access`. [#261](https://github.com/jmhill/yoink/issues/261), [#262](https://github.com/jmhill/yoink/issues/262), [#263](https://github.com/jmhill/yoink/issues/263), [#264](https://github.com/jmhill/yoink/issues/264), [#265](https://github.com/jmhill/yoink/issues/265), [#266](https://github.com/jmhill/yoink/issues/266).

- **Depends on:** that module's M5 task
- **Do:** for one module per commit series (captures, task-management, notes, review, history, access):
  - define the module's own document types
  - remove `@yoink/api-contracts` imports from its domain and application
  - edges map module documents to contract types
- **Accept:** zero `@yoink/api-contracts` lint warnings for that module. When the last module is done, the transitional rule moves to `error`.

`M5.11-captures` is Done ([#347](https://github.com/jmhill/yoink/pull/347), `5fe952f8`). Its own Trunk run [42666346288](https://github.com/jmhill/yoink/actions/runs/42666346288) failed on flaky test [#356](https://github.com/jmhill/yoink/issues/356). The first passing Trunk that contains it is [42686703032](https://github.com/jmhill/yoink/actions/runs/42686703032) on `7cca4c32` (deploy and post-deploy smoke green). [#261](https://github.com/jmhill/yoink/issues/261) is closed completed. The document is `modules/captures/domain/model/capture.ts`. Domain, application, and infrastructure in that module do not import `@yoink/api-contracts`. `edges/public-api/v1` maps the document onto the contract capture. The `src/modules/captures/**` current element is removed. The folder-mode `src/captures/**` pattern stays for the boundary fixtures. The transitional `@yoink/api-contracts` rule stays at `warn` until `M5.11-access`.

### M5.12 Access: interface, unit of work, signup atomicity (absorbs 8.5.6)

**Execution:** `M5.12`. [#267](https://github.com/jmhill/yoink/issues/267). Done on main (`bf10fb6d2fda5c92f39da769e61b9871aa50ad7f`, [#342](https://github.com/jmhill/yoink/pull/342)). Replacing the M5.3, M5.7, and M5.10 interim adapters is deferred until those tasks exist. It was a no-op here.

- **Depends on:** M4.3, M3.5
- **Do:**
  - The standard checklist for access.
  - Publish queries for other modules and edges: authenticate token, authenticate session, organization time zone, principal exists in organization, user display names.
  - Signup (user + organization + memberships + passkey + session) commits as **one** unit-of-work batch, replacing 8.5.6's `UserIdentityStore` idea.
  - Merge the duplicated error factories in `admin-errors.ts` (from 8.5.4).
  - Replacing the interim access adapters from M5.3, M5.7, and M5.10 is deferred until those tasks exist. It was a no-op here.
- **Accept:** standard checklist complete. Signup has an atomicity test (a failure in the last step leaves no rows behind). Signup creates the user with one guarded insert in that same batch (`INSERT … SELECT … WHERE NOT EXISTS`, or the equivalent guard). A unique-email race, the email already taken, is `Conflict` for the access module. It is not a thrown constraint and not HTTP 500. `edges/_shared/auth` uses access's interface.

### M5.13 Access: migrate legacy services (closes 8.5.4)

**Execution:** one issue per service, serialized: `M5.13-admin`, `M5.13-admin-session`, `M5.13-agent`, `M5.13-invitation`, `M5.13-membership`, `M5.13-organization`, `M5.13-passkey`, `M5.13-session`, `M5.13-signup`, `M5.13-token`, `M5.13-user`. [#268](https://github.com/jmhill/yoink/issues/268), [#269](https://github.com/jmhill/yoink/issues/269), [#270](https://github.com/jmhill/yoink/issues/270), [#271](https://github.com/jmhill/yoink/issues/271), [#272](https://github.com/jmhill/yoink/issues/272), [#273](https://github.com/jmhill/yoink/issues/273), [#274](https://github.com/jmhill/yoink/issues/274), [#275](https://github.com/jmhill/yoink/issues/275), [#276](https://github.com/jmhill/yoink/issues/276), [#277](https://github.com/jmhill/yoink/issues/277), [#278](https://github.com/jmhill/yoink/issues/278). `M5.13-admin` is done on main (`e8383e626c81de47e16ad352932254f2c9bd2bc1`, [#345](https://github.com/jmhill/yoink/pull/345)). [#268](https://github.com/jmhill/yoink/issues/268) is closed completed. `M5.13-admin-session` ([#269](https://github.com/jmhill/yoink/issues/269)) is Done (#357, `b66c9614`, Trunk 42716066202). `M5.13-agent` ([#270](https://github.com/jmhill/yoink/issues/270)) is Done (#360, `c60f9ad7`, Trunk 42746581115). `M5.13-invitation` ([#271](https://github.com/jmhill/yoink/issues/271)) is Done (#363, `6e2e3ec2`, Trunk 42756314488). `M5.13-membership` ([#272](https://github.com/jmhill/yoink/issues/272)) is Done (#365, `37f65dd9`, Trunk 42769143582). `M5.13-organization` ([#273](https://github.com/jmhill/yoink/issues/273)) is Done (#367, `151129a8`, Trunk 42782504262). `M5.13-passkey` ([#274](https://github.com/jmhill/yoink/issues/274)) is Done (#369, `670799a2`, Trunk 42796599295). `M5.13-session` ([#275](https://github.com/jmhill/yoink/issues/275)) is Done (#372, `ffb8192e`, Trunk 42813995290). `M5.13-signup` ([#276](https://github.com/jmhill/yoink/issues/276)) is Done (#374, `5e5cc2c8`, Trunk 42835525171). `M5.13-token` ([#277](https://github.com/jmhill/yoink/issues/277)) is Done (#377, `6050eac0`, Trunk 42865576765). `M5.13-user` ([#278](https://github.com/jmhill/yoink/issues/278)) is Done (#378, `b8718c92`, Trunk 42886817299). [#279](https://github.com/jmhill/yoink/issues/279) (`M6.1`) is Done (#350, `ab09e22f`, Trunk 42692777112).

- **Depends on:** M5.12
- **Do:**
  - Migrate every remaining `*-service.ts` in access (admin, admin-session, agent, invitation, membership, organization, passkey, session, signup, token, user) to decide → plan → participant, one service per commit series.
  - Move the `node:crypto` and `@simplewebauthn/server` uses into infrastructure behind ports (a hasher or HMAC port, a WebAuthn verifier port).
  - Remove the `config` import from `passkey-service`.
  - Review the invitation-to-membership seam (8.5.4).
- **Accept:** no `domain/services/` and no npm-package lint warnings in access.

---

## M6: Client edges

### M6.1 Extension edge (`/extension-api/v1/`)

**Execution:** `M6.1`. [#279](https://github.com/jmhill/yoink/issues/279).

- **Depends on:** M5.1, M3.2
- **Do:**
  - `packages/api-contracts/src/extension/v1/`, containing what the extension uses (capture creation, plus anything else the inventory shows).
  - `edges/extension/v1/` with token auth, mounted at `/extension-api/v1/`.
  - The extension sends an `X-Yoink-Extension-Version` header, and edges log it (ADR §9).
  - Switch `apps/extension` to the new contract and path. The old `/api` alias keeps serving older installed versions.
  - Register the prefix in the SPA fallback, the PWA denylist and the dev proxies.
- **Accept:** extension tests and capture acceptance tests pass. Old and new extension builds both work.

### M6.2 Web edge foundation (`/web-api/`)

**Execution:** `M6.2`. [#280](https://github.com/jmhill/yoink/issues/280). Done ([#358](https://github.com/jmhill/yoink/pull/358), `ae8e5ef8`, Trunk [42723879811](https://github.com/jmhill/yoink/actions/runs/42723879811)).

- **Depends on:** M3.5
- **Do:**
  - Add `packages/api-contracts/src/web/` and `edges/web/`, mounted at `/web-api/`, with `combined-auth-middleware` (session plus legacy token until PLAN 7.7c).
  - The web app sends an `X-Yoink-Build` header, and edges log it.
  - Register `/web-api` in the SPA fallback, `apps/web/src/lib/pwa-navigate-fallback`, and the web dev proxy.
  - Move one simple screen end to end as the template. Suggested: Inbox (captures list and create).
- **Accept:** the web app works with one screen on `/web-api/` and the rest on the alias.

### M6.3 Web edge screens

**Execution:** one issue per screen series: `M6.3-process`, `M6.3-tasks-lists`, `M6.3-work`, `M6.3-project-page`, `M6.3-notes`, `M6.3-review`, `M6.3-history`, `M6.3-settings`, `M6.3-auth`. [#281](https://github.com/jmhill/yoink/issues/281), [#282](https://github.com/jmhill/yoink/issues/282), [#283](https://github.com/jmhill/yoink/issues/283), [#284](https://github.com/jmhill/yoink/issues/284), [#285](https://github.com/jmhill/yoink/issues/285), [#286](https://github.com/jmhill/yoink/issues/286), [#287](https://github.com/jmhill/yoink/issues/287), [#288](https://github.com/jmhill/yoink/issues/288), [#289](https://github.com/jmhill/yoink/issues/289). `M6.3-settings` is Done (#362, `44626fc7`, Trunk 42751521944). Members, invitations, tokens, ownership, leave, and organization switch are on `/web-api`. `M6.3-auth` is Done (#364, `d4fb4c44`, Trunk 42762337377). Login, signup, session, logout, passkeys, and join validate/accept are on `/web-api`. Combined auth stays. `token.ts` stays. `GET /auth/tokens` stays token-only on `/api/v1` and the alias. Legacy routes stay. `M6.3-tasks-lists` is Done (#366, `ba75294b`, Trunk 42775501771). The tasks board, named lists, and the unlisted pile are on `/web-api`. The edge returns Task Management pages in query order and does not re-sort. `app.ts` passes the existing handlers. `composition-root.ts` is unchanged. Other screens keep their own resources on the alias. The shared list client moved with the `['lists']` cache. `M6.3-project-page` is Done (#368, `9c065536`, Trunk 42788324468). The project page and staged import are on `/web-api`. Open-task pages stay in Task Management order. The edge does not re-sort. Finished tasks, history, and notes stay on the alias. `app.ts` passes the existing project handlers. `composition-root.ts` is unchanged. `M6.3-work` is Done (#371, `0fa821ef`, Trunk 42804403406). The Work screen and work lists are on `/web-api`. Task Management still owns keyset order and paging. The edge arranges the Now and due pages into sections and adds the query totals and owner labels. It does not re-sort those pages. `app.ts` passes the existing work handlers. `composition-root.ts` is unchanged. Public v1 and the `/api` alias stay.

- **Depends on:** M6.2, plus the module tasks each screen needs (M5.3 for Work, Tasks and Projects; M5.7 for notes; M5.10 for Review and history)
- **Do:** move the web app's screens one at a time, one commit series each, with screen-shaped reads and writes:
  - Inbox and process
  - Tasks and lists
  - Work (Now = next actions + loose dated tasks, header counts, owner labels and display ordering are composed in the edge, per ADR §8.2)
  - Projects and project page
  - Notes
  - Review
  - History and timelines
  - Settings and organizations
  - Auth, passkey, signup, join (client-only legacy routes)

  Follow the one-command-per-handler rule. Where a screen needs two changes to succeed together, stop and raise it: it's a workflow (ADR §8.2).
- **Accept per screen:** that screen's Playwright and HTTP acceptance tests pass, and the web app no longer calls the alias or legacy routes for that screen.

### M6.4 Admin edge (`/admin-api/`)

**Execution:** `M6.4`. [#290](https://github.com/jmhill/yoink/issues/290). Done ([#359](https://github.com/jmhill/yoink/pull/359), `07fd98d3`, Trunk [42739846940](https://github.com/jmhill/yoink/actions/runs/42739846940)).

- **Depends on:** M5.12
- **Do:**
  - Add `packages/api-contracts/src/admin/` and `edges/admin/` with admin-session auth, mounted at `/admin-api/`.
  - The admin app sends `X-Yoink-Build`.
  - Update `apps/admin/vite.config.ts`'s dev proxy (it currently proxies `/api/admin`) and the SPA fallback.
  - Move every admin screen.
- **Accept:** admin acceptance tests pass, and the admin app makes no `/api/admin/...` calls.

### M6.5 Remove client-only legacy routes

**Execution:** `M6.5-web` and `M6.5-admin`. Unknown window lengths stay gates. [#291](https://github.com/jmhill/yoink/issues/291), [#292](https://github.com/jmhill/yoink/issues/292).

- **Depends on:** M6.3 (web) and M6.4 (admin), each removing its own group
- **Do:** delete each `edges/legacy/<area>` once the inventory shows no callers, and once the web edge's expand/contract window has passed (ADR §8.2: no requests from builds that use them for a set number of days, based on `X-Yoink-Build` logs).
- **Accept:** `edges/legacy/` is gone.

### M6.6 Remove `/api/admin/...` from the dev proxy and docs

**Execution:** `M6.6`. [#293](https://github.com/jmhill/yoink/issues/293).

- **Depends on:** M6.4, M6.5
- **Do:** clean up leftover references in Vite configs, docs and the acceptance drivers.
- **Accept:** nothing in the repo references `/api/admin`.

---

## M7: Contract, enforce, review

### M7.1 Announce the `/api` alias sunset

**Execution:** `M7.1`. [#294](https://github.com/jmhill/yoink/issues/294).

- **Depends on:** OPENAPI-V1, M6.1, M6.3, M6.4
- **Do:** set the `Sunset` date (≥ 90 days out, ADR §9) on alias responses. Record the date in the ADR and in `docs/operations/`. Check alias usage per token from the logs.
- **Accept:** the headers carry the real date.

### M7.2 Remove the `/api` alias

**Execution:** `M7.2`. [#295](https://github.com/jmhill/yoink/issues/295).

- **Depends on:** M7.1 plus the conditions in ADR §9: the sunset date has passed, the alias has seen no calls for 30 days, and any remaining token owners have been contacted
- **Do:** unmount the alias. Keep `/api/health` and `/api/v1`.
- **Accept:** acceptance tests use `/api/v1`, and the HTTP driver is updated.

### M7.3 Retire `combined-auth-middleware`

**Execution:** `M7.3`. [#296](https://github.com/jmhill/yoink/issues/296).

- **Depends on:** PLAN 7.7c (removing the web app's legacy token fallback), M7.2
- **Do:** the web edge uses session-only auth. Delete `combined-auth-middleware`.
- **Accept:** auth acceptance tests pass.

### M7.4 Review and remove test fixture routes (ADR §11)

**Execution:** `M7.4`. [#297](https://github.com/jmhill/yoink/issues/297).

- **Depends on:** M5.10, M5.12
- **Do:**
  - For each fixture route in `edges/test-fixtures/`, document **why it exists**, for example backdating `occurredAt`, finishing a task at a given time, or creating an ownerless workspace.
  - Replace each one with setup through public commands. The options are an injected `Clock` in test configuration, seeding through the unit of work in the test harness, or admin commands that already exist.
  - Delete the fixture edge if every route is replaced. Otherwise document the remaining ones and the reason in the ADR.
- **Accept:** the table-ownership exemption for `edges/test-fixtures/` is removed, or justified in writing.

### M7.5 All enforcement at `error` (absorbs 8.5.5)

**Execution:** `M7.5`. [#298](https://github.com/jmhill/yoink/issues/298).

- **Depends on:** M3.7, all of M5, M6.5
- **Do:**
  - Every ADR §10 rule goes to `error`.
  - The table-ownership allowlist is empty, then removed.
  - Confirm `pnpm lint` runs in CI.
  - Update `ESLINT_BASELINE.md` to "zero, enforced".
- **Accept:** `pnpm quality` passes with no boundaries warnings.

### M7.6 Remove legacy contracts and leftovers

**Execution:** `M7.6`. [#299](https://github.com/jmhill/yoink/issues/299).

- **Depends on:** M7.2, M6.5
- **Do:**
  - Delete `packages/api-contracts/src/orpc/` and any schema no longer used.
  - Delete remaining empty top-level folders under `apps/api/src`.
  - Final update of `apps/api/AGENTS.md`.
- **Accept:** `apps/api/src` matches ADR §3 exactly.

### M7.7 Review ADR-002's lessons log

**Execution:** `M7.7`. [#300](https://github.com/jmhill/yoink/issues/300).

- **Depends on:** M7.5
- **Do:** group ADR-002 §5's entries by theme. Check them against ADR-002 §6's conditions for starting. Either draft ADR-002 in full, or close it as **Rejected (not needed)** with the reasoning.
- **Accept:** ADR-002's status is updated.

---

## Dependency summary

```
M0.1  M0.2  M0.3  M0.4  M0.5
              │     │     │
              │     │   M1.1 ── M2.1 ── M2.3
              │     │     │       │
            M1.2 ── M1.3  M2.2 ───┤
                                  M2.4
                     M0.3+M0.4 ── M3.1 ── M3.2 ─┬─ M3.5 ── M3.6
                              M0.4 ── M3.3 ─────┤
                                      M3.4 ─────┘
         M0.2+M2.* ── M4.1 ── M4.2 ── M4.3
                        │
                      M4.1b ── M5.1, M5.3, M5.5
         M1.2 ── M3.7 ── M7.5
         M3.2 ── OPENAPI-V1 ── M7.1
                                         │
       M5.1 (captures) ── M5.2 ── M5.3 ──┬── M5.4
                │                        ├── M5.5 (processing) ── M5.6
                │                        ├── M5.7 (notes) ── M5.8, M5.9
                │                        └── M5.10 (review, history)
                │        M5.12 (access) ── M5.13
                │        M5.11 (own types, per module, after each)
                └── M6.1 (extension)
   M3.5 ── M6.2 ── M6.3 (screens, as modules land)    M5.12 ── M6.4 (admin)
                       M6.5 ── M6.6
   M7.1 ── M7.2 ── M7.3 (after PLAN 7.7c)      M7.4      M7.5 ── M7.6, M7.7
```

M4.4 runs after every M5 task that removes callers of history's cross-module guards.

## Execution mandate

Tycho owns engineering decisions, tests, architecture review, and merge gates. There is no routine per-issue check-in. Escalate only a genuinely major architecture, product, security, data-safety, or scope decision, or a blocker that needs Justin. Everyday implementation choices stay with Tycho.

One bounded task per coder. Serialize edits to `composition-root.ts`, `app.ts`, this plan, and ADR-001. No new module kit and no DI container. Domain stays a pure `Result` with closed error unions. Effects stay in adapters. Only the owning module's infrastructure names a table in SQL. Baselines and the table-ownership allowlist only shrink. Public v1 and the `/api` alias keep today's HTTP status and error bodies. Migrations are forward-only. Compatibility windows and sunset dates are gates, not guesses. Do not apply the `approved-plan` label. This authorization was not approval in the Yoink Dev Team room.

`CL-WORK` (#243) and `CL-REVIEW` (#244) are done. Justin adopted option 1 for both on 2026-11-09 at 10:43am CST ([#243](https://github.com/jmhill/yoink/issues/243#issuecomment-6745725026), [#244](https://github.com/jmhill/yoink/issues/244#issuecomment-6745725813)). Token listing (#327) is done ([#340](https://github.com/jmhill/yoink/pull/340), `dc7da8044357eda0887f9a9fc7e86acb002b3a58`). [#327](https://github.com/jmhill/yoink/issues/327) is closed.

Notes mirror-bot resolution keeps today's order: stored designation, then `NOTES_MIRROR_BOT_USER_ID`, then the first agent named `NOTES_MIRROR_BOT_NAME`. Do not drop the environment fallback.

Unknown retirement lengths stay recorded gates. ADR §8.2's "a set number of days", and admin's shorter window, are unset. Do not invent a number or remove routes early.

Docs-only tasks and unmerged spikes follow the issue's Tests section. When that section says `pnpm quality` is not required, it is not a gate and must not be claimed. That covers `M0.2`, `M0.3`, `M0.4`, `M0.5`, `CL-WORK`, `CL-REVIEW`, and `M7.7`. PR CI ignores `docs/**` and `*.md`. Code tasks still follow the Definition of done above.

## Execution index

Stable task keys. M0.1 stays complete and has no issue. Logical dependencies are the plan's dependencies. "Serialize after" is an execution edge for a shared file (`composition-root.ts`, `app.ts`, ADR-001, or one access-service series). It does not add a logical dependency and it does not rewrite the task prose above.

This table is the only status list. The row count is the number of rows below. It is not frozen. New tasks extend it. `docs/PLAN.md` keeps checkboxes only.

A task is Done only after its merge commit's Trunk run succeeds, including deploy and post-deploy smoke. Until that run succeeds, the status is Merged, not Done.

Known issues: [#354](https://github.com/jmhill/yoink/issues/354) (Trunk [42629355792](https://github.com/jmhill/yoink/actions/runs/42629355792) on `bf10fb6d`, the API stopped responding mid-E2E and the logs do not capture the API) and [#356](https://github.com/jmhill/yoink/issues/356) (flaky `managing-invitations` "member cannot create invitation" timed out waiting for the signup Email field on Trunk [42666346288](https://github.com/jmhill/yoink/actions/runs/42666346288)), and [#370](https://github.com/jmhill/yoink/issues/370) (flaky `process-one-at-a-time` "ignores a second Delete while the first trash is pending" timed out waiting 30s for the trash response during local e2e for #369 on `bf462cba`; a focused rerun of that file passed).

M0.2 has no GitHub issue. The technical spike is complete. The obsolete waiting-on-Submit note is retired. Do not create or close an issue for it. Measurements are in `docs/architecture/adr/spikes/README.md`.

`CL-WORK` (#243) and `CL-REVIEW` (#244) are done. Justin adopted option 1 for both on 2026-11-09 at 10:43am CST ([#243](https://github.com/jmhill/yoink/issues/243#issuecomment-6745725026), [#244](https://github.com/jmhill/yoink/issues/244#issuecomment-6745725813)). `TOKEN-LIST` (#327) is done ([#340](https://github.com/jmhill/yoink/pull/340), `dc7da8044357eda0887f9a9fc7e86acb002b3a58`). [#327](https://github.com/jmhill/yoink/issues/327) is closed.

The logical dependencies plus the serialization edges were checked together. There is no cycle. `M0.3` serializes after `M0.2` only. They are not mutual. `M4.1b` depends on `M4.1` and is a dependency of `M5.1`, `M5.3`, and `M5.5`. `M4.4` depends on `M5.3`, `M5.5`, and `M5.7`, and nothing in M5 depends on `M4.4` except through `M7.5`. `M3.7` depends on completed `M1.2` and is a dependency of `M7.5`. `OPENAPI-V1` depends on `M3.2` and is a dependency of `M7.1`, because announcing the alias sunset directs people to `/api/v1`. `M5.11-access` depends on `M5.13-user`. The access-service chain does not depend on `M5.11-access`.

`M2.3` has no downstream issue. That note is not a new dependency. `M6.6`, `M7.3`, `M7.4`, `M7.6`, `M7.7`, `TOKEN-LIST`, and `LINT-ACCEPTANCE` are leaves. `LINT-ACCEPTANCE` puts this package's lint in quality and leaves the browser suite in the E2E job. It does not rewrite the ESLint baseline.

| ID | Logical dependencies | Serialize after | Status | Gate | GitHub |
|---|---|---|---|---|---|
| `M0.2` | — | — | Done. U1 chosen. Technical work is complete. Measurements are in the spike log. | Cleared. Not `yoink-prod`. `foreignKeys: null` is a reporter bug. M4.1 tests foreign keys. No production unit of work. No user action. | No issue. |
| `M0.3` | — | `M0.2` | Done on main (`b30fe62241ef3335fc058d34f100f55b4a3672e1`, [#313](https://github.com/jmhill/yoink/pull/313)) | None. | [#224](https://github.com/jmhill/yoink/issues/224) |
| `M0.4` | — | — | Done ([#301](https://github.com/jmhill/yoink/pull/301)) | None. Every route is classified. No ambiguous rows. | [#223](https://github.com/jmhill/yoink/issues/223) |
| `M0.5` | — | — | Done (`93584ce`, [#225](https://github.com/jmhill/yoink/issues/225)) | None. | [#225](https://github.com/jmhill/yoink/issues/225) |
| `LINT-ACCEPTANCE` | `M0.5` | — | Done ([#332](https://github.com/jmhill/yoink/pull/332), `5f377b3c3cf12ec2b7137e31f5f79707a8c76651`). [#328](https://github.com/jmhill/yoink/issues/328) closed completed. The four unused bindings are gone. Acceptance-test lint is in quality. | On that PR, `@yoink/acceptance-tests#lint` was a cache miss and executed eslint (`556849c241ca744a`). Build, typecheck, and test were 24/24 cached. E2E `@yoink/acceptance-tests:test` was a cache miss and executed vitest (`52420ee2153af47e`): 93 files, 746 passed, started 2026-11-08T02:05:24Z (2026-11-07 8:05:24pm CST), duration 783.04s. The recorded API baseline stays 177. The baseline file is not rewritten. | [#328](https://github.com/jmhill/yoink/issues/328) |
| `M1.1` | `M0.5` | — | Done (`3b0441b`, [#302](https://github.com/jmhill/yoink/pull/302)) | None. | [#226](https://github.com/jmhill/yoink/issues/226) |
| `M1.2` | — | — | Done (`f2a94e7`, [#227](https://github.com/jmhill/yoink/issues/227)) | None. | [#227](https://github.com/jmhill/yoink/issues/227) |
| `M1.3` | `M1.2` | — | Done (`cedc109`, [#305](https://github.com/jmhill/yoink/pull/305)) | None. | [#228](https://github.com/jmhill/yoink/issues/228) |
| `M2.1` | `M1.1` | — | Done (`db23e4f`, [#306](https://github.com/jmhill/yoink/pull/306)) | None. | [#229](https://github.com/jmhill/yoink/issues/229) |
| `M2.2` | `M1.1` | `M2.1` | Done (`882488f`, [#308](https://github.com/jmhill/yoink/pull/308)) | None. | [#230](https://github.com/jmhill/yoink/issues/230) |
| `M2.3` | `M2.1`, `M2.2` | — | Done (`c1358cc`, [#309](https://github.com/jmhill/yoink/pull/309)) | None. | [#231](https://github.com/jmhill/yoink/issues/231) |
| `M2.4` | `M2.1` | `M2.2` | Done (`cecc6e4cc5371a1a54184eab61172a9d24eb911f`, [#310](https://github.com/jmhill/yoink/pull/310)) | None. | [#232](https://github.com/jmhill/yoink/issues/232) |
| `M3.1` | `M0.3`, `M0.4` | — | Done (`198616d599acacd71b3e64203e62eb0ee5bc139d`, [#315](https://github.com/jmhill/yoink/pull/315)) | None. The frozen copy does not mount a route. | [#233](https://github.com/jmhill/yoink/issues/233) |
| `M3.2` | `M3.1`, `M2.4` | — | Done ([#317](https://github.com/jmhill/yoink/pull/317)). | Dates stay unset until M7.1. OPENAPI-V1 is done ([#334](https://github.com/jmhill/yoink/pull/334), `30f08e333c45e7e7292955fa877c702fbef6374a`). | [#234](https://github.com/jmhill/yoink/issues/234) |
| `OPENAPI-V1` | `M3.2` | — | Done ([#334](https://github.com/jmhill/yoink/pull/334), `30f08e333c45e7e7292955fa877c702fbef6374a`). [#329](https://github.com/jmhill/yoink/issues/329) closed completed. | None. The converter stays on Zod 3. It does not upgrade oRPC or Zod. | [#329](https://github.com/jmhill/yoink/issues/329) |
| `TOKEN-LIST` | `M3.2` | — | Done ([#340](https://github.com/jmhill/yoink/pull/340), `dc7da8044357eda0887f9a9fc7e86acb002b3a58`). [#327](https://github.com/jmhill/yoink/issues/327) closed completed. | None. Justin approved on 2026-11-07 at 21:45 CST. Own principal, including a sibling. Non-revoked metadata only: `id`, `name`, optional `lastUsedAt`, `createdAt`. Never a hash or a raw secret. v1 is bearer-only. The alias accepts session or bearer. Create, revoke, and reissue stay session-only. Runtime behavior is unchanged. | [#327](https://github.com/jmhill/yoink/issues/327) |
| `M3.3` | `M0.4`, `M2.4` | `M3.2` | Done on main (`0959d7d6d4f855a74331f08a485d8dd6a72321cf`, [#320](https://github.com/jmhill/yoink/pull/320)). | None. | [#235](https://github.com/jmhill/yoink/issues/235) |
| `M3.4` | `M2.2`, `M3.3` | — | Done on main (`67e24d6b4e5d5f76db883679cf3cf6983ff4c598`, [#321](https://github.com/jmhill/yoink/pull/321)). | None. | [#236](https://github.com/jmhill/yoink/issues/236) |
| `M3.5` | `M3.2`, `M3.3` | — | Done on main (`f422e83d14b1bb066f461d406b0b6eeaf9b821f6`, [#322](https://github.com/jmhill/yoink/pull/322)). | None. | [#237](https://github.com/jmhill/yoink/issues/237) |
| `M3.6` | `M3.2`, `M3.3`, `M3.4`, `M3.5` | — | Done. HTTP test move ([#323](https://github.com/jmhill/yoink/pull/323)). Health mapper ([#331](https://github.com/jmhill/yoink/pull/331), `a447ec0dbcde6059059833623f20347001bc1ed5`). [#238](https://github.com/jmhill/yoink/issues/238) closed completed. | `apps/api/src/health` is gone. `mapHealthCheckError` is `edges/ops/orpc-health-errors.ts`. `platform/health` still returns `ResultAsync<HealthStatus, HealthCheckError>`. Lint 150 (117 `boundaries/element-types`, 33 `@typescript-eslint/no-explicit-any`). Allowlist unchanged, no exemption. Forced E2E was 745 passed and 1 signup email timeout before setup, then a focused rerun of 15 passed. That is not a fresh 746. No separate index row. | [#238](https://github.com/jmhill/yoink/issues/238) |
| `M3.7` | `M1.2` | — | Done. Allowlist move ([#324](https://github.com/jmhill/yoink/pull/324)). Filename correction ([#338](https://github.com/jmhill/yoink/pull/338), `a93e1bc16f1c1cd99ee367eaeb44f07f914c0635`). Allowlist stays 33. | None. Helpers are `migration-seed.ts` and `seed-test-user-session.ts`. Vitest does not exclude them. `src/tests/helpers/**` is the only test-support exemption, covered by a self-test. Every `*.test.ts` has a real test. No production exemption. | [#326](https://github.com/jmhill/yoink/issues/326) |
| `M4.1` | `M0.2`, `M2.1`, `M2.2` | — | Done ([#314](https://github.com/jmhill/yoink/pull/314)). Per-statement `execute` inside `transaction('write')`. | None. U1 transaction, no guard table. The file test observed foreign keys on. | [#239](https://github.com/jmhill/yoink/issues/239) |
| `M4.1b` | `M4.1` | — | Done ([#336](https://github.com/jmhill/yoink/pull/336), `db30c3872b1c4a5855d285d49f6526fec418e085`). Spike passed (2026-11-07 7:28 CT, exit 0, test database only). Justin approved the contract on 2026-11-07 at 21:31 CST ([#325](https://github.com/jmhill/yoink/issues/325)). | None. `sqlite-unit-of-work.ts` sends one `tx.batch` inside `transaction('write')`. M5.3 is Done. M5.5 is Done (#373, `8903adaf`, Trunk 42822389879). | [#325](https://github.com/jmhill/yoink/issues/325) |
| `M4.2` | `M4.1`, `M2.4` | — | Done (`a445f0ec62bbe822c770eb2cefc4b9a8aa1423fc`, [#316](https://github.com/jmhill/yoink/pull/316)) | None. `shared/` is removed. No unit-of-work sink. | [#240](https://github.com/jmhill/yoink/issues/240) |
| `M4.3` | `M4.2` | — | Done on main (`eb4fcf4ae007d178b2b9346ebf1c03880da374a6`, [#318](https://github.com/jmhill/yoink/pull/318)). Empty sink on both implementations. No route uses it yet. | None. | [#241](https://github.com/jmhill/yoink/issues/241) |
| `M4.4` | `M5.3`, `M5.5`, `M5.7` | — | In review ([#381](https://github.com/jmhill/yoink/pull/381)). | The five history `sql.ts` allowlist rows are gone. History lookup rows stay for M5.10-history. Allowlist 11 to 6. API lint stays 5. Web stays 32. `app.ts` and `composition-root.ts` do not change. | [#242](https://github.com/jmhill/yoink/issues/242) |
| `CL-WORK` | — | — | Done. Justin adopted option 1 on 2026-11-09 at 10:43am CST ([#243](https://github.com/jmhill/yoink/issues/243#issuecomment-6745725026)). | None. Task Management owns the Now, due, and work-list queries, including keyset order and pagination. Those queries return already ordered, filtered, cursor-paginated pages. The web edge composes screen sections, header counts, and owner display labels. It does not re-sort those pages. ADR §8.2 "display ordering" means screen and section composition. | [#243](https://github.com/jmhill/yoink/issues/243) |
| `CL-REVIEW` | — | — | Done. Justin adopted option 1 on 2026-11-09 at 10:43am CST ([#244](https://github.com/jmhill/yoink/issues/244#issuecomment-6745725813)). | None. Review owns the attention policy: classification, section order, and queries. It consumes Task Management, history, and access ports. The web `/projects` screen and public `GET /review`, `GET /review/done`, and the `/api` aliases share one Review query. No cross-module SQL. The attention keyset stays. The done-list keyset stays `(completedAt, task id)`. Edges never re-sort a paginated result. | [#244](https://github.com/jmhill/yoink/issues/244) |
| `M5.1-check` | `M1.3`, `M4.2` | — | Done on main (`3729b977c1cf2da5baa2e58cb99a8c0facb47942`, [#319](https://github.com/jmhill/yoink/pull/319)). `change_log.subject_type` may be `capture`. No capture event is emitted. | None. | [#246](https://github.com/jmhill/yoink/issues/246) |
| `M5.1` | `M3.6`, `M4.3`, `M5.1-check`, `M4.1b` | — | Done ([#343](https://github.com/jmhill/yoink/pull/343), `72780cac9169dd24ab1403ae69395da72f9ee253`). | None. | [#247](https://github.com/jmhill/yoink/issues/247) |
| `M5.2` | `M5.1`, `CL-WORK` | — | Done (#352, `4c4b28bb`, Trunk [42701505987](https://github.com/jmhill/yoink/actions/runs/42701505987)) | Tasks, projects, lists, and the Now, due, and work-list queries live in `modules/task-management/`. `work/` is gone. `/api/work/*` stays on the public API edge. `composition-root.ts` and `app.ts` changed only to import the new entry. Allowlist 33 to 29. Lint 150 to 93 (`boundaries/element-types` 117 to 60, `@typescript-eslint/no-explicit-any` 33). | [#248](https://github.com/jmhill/yoink/issues/248) |
| `M5.3` | `M5.2`, `M4.1b` | — | Done (#361, `954619ed`, Trunk [42731265947](https://github.com/jmhill/yoink/actions/runs/42731265947)). | Task, project, list, and import writes, including project-done for 1,000 open tasks, commit through the shared unit of work. `prepare.createTask` and `prepare.createProject` are published. `TaskDeleted` `source` is on the integration event; the timeline payload stays `{ captureId }`. The assignee port stays `OrgPrincipalLookup`. Allowlist 29 to 28: removed `FROM change_log` in `project-store-backed-persist.ts`. Lint unchanged at 93 (`boundaries/element-types` 60, `@typescript-eslint/no-explicit-any` 33). | [#249](https://github.com/jmhill/yoink/issues/249) |
| `M5.4` | `M5.3` | — | Done (#375, `300dd1f3`, Trunk 42845309412). #250 is closed. | Get is a query on the task handlers. Pin, unpin, and delete already decide, plan, and commit. Task, project, list, and work store interfaces live under persistence. `domain/services` and `domain/ports` are gone. The domain does not import `edges/_shared/request-validation`. Access admin keeps a two-method project port, so the `ProjectStore` import warning is gone. `app.ts` drops `taskService`. `composition-root.ts` stops constructing it and keeps the processing policies and the signup unit of work. Allowlist stays 23. API lint 11 to 10 (`boundaries/element-types`). Web stays 32. That PR set the baselines to allowlist 23, API lint 10, and web 32. | [#250](https://github.com/jmhill/yoink/issues/250) |
| `M5.5` | `M5.1`, `M5.3`, `M4.1b` | — | Done (#373, `8903adaf`, Trunk 42822389879). | `processing/` is `workflows/processing/` with domain, application, policies, and `index.ts`, and no infrastructure. Process queries the inbox capture, prepares a starter, prepares `markProcessed`, and commits once. A captures guard-miss stays `CAPTURE_NOT_IN_INBOX` (task HTTP 400, project HTTP 409). delete-source-capture is registered on the unit of work. Allowlist 28 to 23. API lint 60 to 11 (`boundaries/element-types` 60 to 11). Web stays 32. That PR set the baselines to allowlist 23 and API lint 11. | [#251](https://github.com/jmhill/yoink/issues/251) |
| `M5.6` | `M5.5` | — | Not started | None. | [#252](https://github.com/jmhill/yoink/issues/252) |
| `M5.7` | `M5.3` | — | Done (#376, `4ae674c1`, Trunk 42854951002). | Notes live in `modules/notes/`. Create, update, delete, and import commit one notes plan. History writes the timeline from the integration event. Notes SQL names `project_notes`, plus the allowlisted `organizations` mirror-bot read and write until M5.8c. Allowlist 23 to 17. API lint is 10 (`boundaries/element-types`). Web stays 32. The baselines are allowlist 17, API lint 10, and web 32. `app.ts` and `composition-root.ts` changed. | [#253](https://github.com/jmhill/yoink/issues/253) |
| `M5.8a` | `M5.7`, `M1.3` | — | Done (#380, `d057cb15`, Trunk 42878712223). | Notes-owned migration 045 creates empty `notes_settings`: organization id, and the designated mirror-bot user id as an opaque column. The organization foreign key is the identity anchor. The old `organizations.notes_mirror_bot_user_id` column stays the source of truth. No reader or writer switch. `app.ts` and `composition-root.ts` are unchanged. Allowlist stays 17. API lint stays 10. Web stays 32. | [#254](https://github.com/jmhill/yoink/issues/254) |
| `M5.8b` | `M5.8a` | — | Not started | None. | [#255](https://github.com/jmhill/yoink/issues/255) |
| `M5.8c` | `M5.8b` | — | Not started | Keep today's resolution order, including the env fallback. Not a product change. | [#256](https://github.com/jmhill/yoink/issues/256) |
| `M5.8d` | `M5.8c` | — | Not started | Release gate. Drop the column only after M5.8c is in production. Confirm before that PR. | [#257](https://github.com/jmhill/yoink/issues/257) |
| `M5.9` | `M5.7` | — | Not started | None. | [#258](https://github.com/jmhill/yoink/issues/258) |
| `M5.10-review` | `M5.3`, `M4.3`, `CL-REVIEW` | — | Merged (#379, `ea48d512`), Trunk pending. | `CL-REVIEW` is decided ([#244](https://github.com/jmhill/yoink/issues/244#issuecomment-6745725813)). Review owns the attention policy. It reads Task Management projects and finished tasks, history's latest project change, and access's organization time zone. The web `/projects` screen and public `GET /review`, `GET /review/done`, and the `/api` aliases share that query. No cross-module SQL. The attention keyset stays. The done-list keyset stays `(completedAt, task id)`. Edges never re-sort a paginated result. Allowlist 17 to 11. API lint 10 to 5. Web stays 32. | [#259](https://github.com/jmhill/yoink/issues/259) |
| `M5.10-history` | `M5.3`, `M4.3`, `M5.7` | — | Not started | None. | [#260](https://github.com/jmhill/yoink/issues/260) |
| `M5.11-captures` | `M5.1` | — | Done ([#347](https://github.com/jmhill/yoink/pull/347), `5fe952f8`). [#261](https://github.com/jmhill/yoink/issues/261) closed completed. Its own Trunk run [42666346288](https://github.com/jmhill/yoink/actions/runs/42666346288) failed on flaky [#356](https://github.com/jmhill/yoink/issues/356). The first passing Trunk that contains it is [42686703032](https://github.com/jmhill/yoink/actions/runs/42686703032) on `7cca4c32` (deploy and smoke green). | Known issue [#356](https://github.com/jmhill/yoink/issues/356). | [#261](https://github.com/jmhill/yoink/issues/261) |
| `M5.11-task-management` | `M5.4` | — | Not started | None. | [#262](https://github.com/jmhill/yoink/issues/262) |
| `M5.11-notes` | `M5.7` | — | Not started | None. | [#263](https://github.com/jmhill/yoink/issues/263) |
| `M5.11-review` | `M5.10-review` | — | Not started | None. | [#264](https://github.com/jmhill/yoink/issues/264) |
| `M5.11-history` | `M5.10-history` | — | Not started | None. | [#265](https://github.com/jmhill/yoink/issues/265) |
| `M5.11-access` | `M5.13-user` | — | Not started | None. | [#266](https://github.com/jmhill/yoink/issues/266) |
| `M5.12` | `M4.3`, `M3.5` | — | Done ([#342](https://github.com/jmhill/yoink/pull/342), `bf10fb6d2fda5c92f39da769e61b9871aa50ad7f`). | Known issue [#354](https://github.com/jmhill/yoink/issues/354): Trunk [42629355792](https://github.com/jmhill/yoink/actions/runs/42629355792) stopped responding mid-E2E. The next Trunk, [42647342791](https://github.com/jmhill/yoink/actions/runs/42647342791) on `72780cac`, passed. Signup's create-user is one guarded insert in the batch. A unique-email race is `Conflict`, not HTTP 500. Replacing the M5.3, M5.7, and M5.10 interim adapters is deferred until those tasks exist. It was a no-op here. | [#267](https://github.com/jmhill/yoink/issues/267) |
| `M5.13-admin` | `M5.12` | — | Done ([#345](https://github.com/jmhill/yoink/pull/345), `e8383e626c81de47e16ad352932254f2c9bd2bc1`). [#268](https://github.com/jmhill/yoink/issues/268) closed completed. | None. `createAdminService` decides, then commits an access plan. The composition root passes the sqlite `unitOfWork` into `createAdminService`, so those plans commit through the access participant. | [#268](https://github.com/jmhill/yoink/issues/268) |
| `M5.13-admin-session` | `M5.12` | `M5.13-admin` | Done (#357, `b66c9614`, Trunk 42716066202). | None. | [#269](https://github.com/jmhill/yoink/issues/269) |
| `M5.13-agent` | `M5.12` | `M5.13-admin-session` | Done (#360, `c60f9ad7`, Trunk 42746581115). | None. `createAgentService` decides from the mint command and the membership and organization queries, then commits one access plan. The composition root passes the sqlite `unitOfWork` into `createAgentService`. | [#270](https://github.com/jmhill/yoink/issues/270) |
| `M5.13-invitation` | `M5.12` | `M5.13-agent` | Done (#363, `6e2e3ec2`, Trunk 42756314488). | None. `createInvitationService` decides from the create or revoke command and the organization and membership queries, then commits one access plan. The composition root passes the sqlite `unitOfWork` into `createInvitationService`. Accept stays on `handleAcceptInvitation`. Invite-lock is unchanged. | [#271](https://github.com/jmhill/yoink/issues/271) |
| `M5.13-membership` | `M5.12` | `M5.13-invitation` | Done (#365, `37f65dd9`, Trunk 42769143582). | None. `createMembershipService` decides from the add, remove, or role-change command and the user, organization, and membership queries, then commits one access plan. The composition root passes the sqlite `unitOfWork` into `createMembershipService`. Leave guards stay in `decideRemoveMember`. Ownership transfer stays on `handleTransferOwnership`. | [#272](https://github.com/jmhill/yoink/issues/272) |
| `M5.13-organization` | `M5.12` | `M5.13-membership` | Done (#367, `151129a8`, Trunk 42782504262). | None. `createOrganizationService` decides from the create command, then commits one access plan. Get and list stay reads. The composition root passes the sqlite `unitOfWork` into `createOrganizationService`. The upsert sets only the name on conflict, so `notes_mirror_bot_user_id` stays. Admin create and rename stay on `createAdminService`. | [#273](https://github.com/jmhill/yoink/issues/273) |
| `M5.13-passkey` | `M5.12` | `M5.13-organization` | Done (#369, `670799a2`, Trunk 42796599295). | API lint 93 to 60 (`boundaries/element-types` stays 60, `@typescript-eslint/no-explicit-any` 33 to 0). Web stays 32. Allowlist stays 28. `createPasskeyService` decides from the registration, authentication, or delete command and the user or credential queries, then commits one access plan. The composition root passes the sqlite `unitOfWork` into `createPasskeyService`. `@simplewebauthn/server` stays behind the verifier port. The service does not import config. `planRegistrationCredential` still verifies and does not write. Signup's batch is unchanged. List and option generation stay reads. | [#274](https://github.com/jmhill/yoink/issues/274) |
| `M5.13-session` | `M5.12` | `M5.13-passkey` | Done (#372, `ffb8192e`, Trunk 42813995290). | Allowlist stays 28. API lint stays 60. Web stays 32. `createSessionService` decides from the create, refresh, revoke, or switch command and the user, session, or membership queries, then commits one access plan. The composition root passes the sqlite `unitOfWork` into `createSessionService`. Validate stays a read. Cleanup counts expired rows, then commits the delete, because the unit of work does not return `rowsAffected`. The edge still sets the cookie. | [#275](https://github.com/jmhill/yoink/issues/275) |
| `M5.13-signup` | `M5.12` | `M5.13-session` | Done (#374, `5e5cc2c8`, Trunk 42835525171). | Allowlist stays 23. API lint stays 11. Web stays 32. `createSignupService` decides from the code, the email, and the invitation, member, user, and organization queries. Validate does not write. Complete uses that decision, `planRegistrationCredential` verifies and does not write, then commits the existing signup plan. The composition root passes the sqlite `unitOfWork` into `createSignupService`. The user insert stays the only guard. | [#276](https://github.com/jmhill/yoink/issues/276) |
| `M5.13-token` | `M5.12` | `M5.13-signup` | Done (#377, `6050eac0`, Trunk 42865576765). | Allowlist stays 17. API lint stays 10. Web stays 32. Issue and revoke decide, then commit one token plan. List stays a read of the principal's own non-revoked tokens in the organization and returns metadata only. Validate decides and does not fail the request. The last-used update stays the token store. Reissue stays on the token store. Create, revoke, and reissue stay session-only. The composition root passes the sqlite `unitOfWork` into `createTokenHandlers`. | [#277](https://github.com/jmhill/yoink/issues/277) |
| `M5.13-user` | `M5.12` | `M5.13-token` | Done (#378, `b8718c92`, Trunk 42886817299). | Create decides, then commits one create-user plan. Get, get-by-email, and get-by-ids stay reads. Signup's user insert stays the guarded one. `challenge.ts` stays in domain and takes `nodeChallengeCrypto`. The composition root passes the sqlite `unitOfWork` into `createUserService` and keeps `isTokenPlan` with the token handlers' `unitOfWork`. Allowlist stays 17. API lint stays 10. Web stays 32. | [#278](https://github.com/jmhill/yoink/issues/278) |
| `M6.1` | `M5.1`, `M3.2` | — | Done (#350, `ab09e22f`, Trunk [42692777112](https://github.com/jmhill/yoink/actions/runs/42692777112)) | None. | [#279](https://github.com/jmhill/yoink/issues/279) |
| `M6.2` | `M3.5`, `M5.1` | — | Done (#358, `ae8e5ef8`, Trunk [42723879811](https://github.com/jmhill/yoink/actions/runs/42723879811)) | None. | [#280](https://github.com/jmhill/yoink/issues/280) |
| `M6.3-process` | `M6.2`, `M5.1`, `M5.5` | — | Not started | None. | [#281](https://github.com/jmhill/yoink/issues/281) |
| `M6.3-tasks-lists` | `M6.2`, `M5.3` | — | Done (#366, `ba75294b`, Trunk 42775501771). | None. The tasks board, named lists, and unlisted order are on `/web-api`. Task Management still owns keyset order. The edge returns those pages and reorder results in query order and does not sort. `app.ts` passes the existing handlers. `composition-root.ts` is unchanged. Public v1 and the `/api` alias stay. | [#282](https://github.com/jmhill/yoink/issues/282) |
| `M6.3-work` | `M6.2`, `M5.3`, `CL-WORK` | — | Done (#371, `0fa821ef`, Trunk 42804403406). | None. The Work screen and work lists are on `/web-api`. Task Management still owns keyset order and paging. The edge arranges the Now and due pages into sections and adds the query totals and owner labels. It does not re-sort those pages. Work lists stay in query order. `app.ts` passes the existing work handlers and the existing member reads. `composition-root.ts` is unchanged. Public v1 and the `/api` alias stay. | [#283](https://github.com/jmhill/yoink/issues/283) |
| `M6.3-project-page` | `M6.2`, `M5.3` | — | Done (#368, `9c065536`, Trunk 42788324468). | None. The project page and staged import are on `/web-api`. Task Management still owns open-task order. The edge returns that page in query order and does not sort. The page splits it into the next-action section and the other open tasks and adds the count. Finished tasks, history, and notes stay on `/api`. The shared `['projects']` catalog stays on `/api`. `app.ts` passes the existing project handlers. `composition-root.ts` is unchanged. Public v1 and the `/api` alias stay. | [#284](https://github.com/jmhill/yoink/issues/284) |
| `M6.3-notes` | `M6.2`, `M5.7` | `M6.3-project-page` | Not started | None. | [#285](https://github.com/jmhill/yoink/issues/285) |
| `M6.3-review` | `M6.2`, `M5.10-review` | — | Not started | None. | [#286](https://github.com/jmhill/yoink/issues/286) |
| `M6.3-history` | `M6.2`, `M5.10-history` | `M6.3-project-page`, `M6.3-tasks-lists` | Not started | None. | [#287](https://github.com/jmhill/yoink/issues/287) |
| `M6.3-settings` | `M6.2`, `M5.12` | — | Done (#362, `44626fc7`, Trunk 42751521944). | None. | [#288](https://github.com/jmhill/yoink/issues/288) |
| `M6.3-auth` | `M6.2`, `M5.12` | `M6.3-settings` | Done (#364, `d4fb4c44`, Trunk 42762337377). | None. Login, signup, session, logout, passkeys, and join validate/accept are on `/web-api`. Combined auth stays. `apps/web/src/lib/token.ts` stays. `GET /auth/tokens` stays token-only on `/api/v1` and the `/api` alias. Legacy routes stay. `app.ts` passes the existing signup handlers into `registerWebApi`. `composition-root.ts` is unchanged. | [#289](https://github.com/jmhill/yoink/issues/289) |
| `M6.4` | `M5.12` | — | Done (#359, `07fd98d3`, Trunk [42739846940](https://github.com/jmhill/yoink/actions/runs/42739846940)). | None. | [#290](https://github.com/jmhill/yoink/issues/290) |
| `M6.5-web` | `M6.3-process`, `M6.3-tasks-lists`, `M6.3-work`, `M6.3-project-page`, `M6.3-notes`, `M6.3-review`, `M6.3-history`, `M6.3-settings`, `M6.3-auth` | — | Not started | Justin sets the day count. Logs must be quiet for that many days. Do not guess. | [#291](https://github.com/jmhill/yoink/issues/291) |
| `M6.5-admin` | `M6.4` | — | Not started | Justin sets the shorter admin window. Do not guess. | [#292](https://github.com/jmhill/yoink/issues/292) |
| `M6.6` | `M6.4`, `M6.5-admin` | — | Not started | None. | [#293](https://github.com/jmhill/yoink/issues/293) |
| `M7.1` | `OPENAPI-V1`, `M6.1`, `M6.3-process`, `M6.3-tasks-lists`, `M6.3-work`, `M6.3-project-page`, `M6.3-notes`, `M6.3-review`, `M6.3-history`, `M6.3-settings`, `M6.3-auth`, `M6.4` | — | Not started | Justin chooses the Sunset date, at least 90 days out, before headers advertise it. No outreach. OPENAPI-V1 is done ([#334](https://github.com/jmhill/yoink/pull/334), `30f08e333c45e7e7292955fa877c702fbef6374a`). | [#294](https://github.com/jmhill/yoink/issues/294) |
| `M7.2` | `M7.1` | — | Not started | Sunset has passed, 30 days with no alias calls, and a person has contacted any remaining token owner. Do not send outreach. | [#295](https://github.com/jmhill/yoink/issues/295) |
| `M7.3` | `M7.2` | — | Not started | External gate: PLAN 7.7c is done, plus M7.2. Do not perform 7.7c here. | [#296](https://github.com/jmhill/yoink/issues/296) |
| `M7.4` | `M5.10-review`, `M5.12` | — | Not started | Stop if replacing a fixture needs a new product command. | [#297](https://github.com/jmhill/yoink/issues/297) |
| `M7.5` | `M3.7`, `M4.4`, `M5.6`, `M5.8d`, `M5.9`, `M5.11-captures`, `M5.11-task-management`, `M5.11-notes`, `M5.11-review`, `M5.11-history`, `M5.11-access`, `M6.5-web`, `M6.5-admin` | — | Not started | None. M3.7 already removed the test-helper rows. | [#298](https://github.com/jmhill/yoink/issues/298) |
| `M7.6` | `M7.2`, `M6.5-web`, `M6.5-admin` | — | Not started | None. | [#299](https://github.com/jmhill/yoink/issues/299) |
| `M7.7` | `M7.5` | — | Not started | Tycho reviews the grouped log before the status change. | [#300](https://github.com/jmhill/yoink/issues/300) |

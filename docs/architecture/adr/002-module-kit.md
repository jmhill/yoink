# ADR-002: Module kit

- **Status:** Deferred (stub). Design intentionally left open
- **Date:** 2026-11-06
- **Deciders:** Justin
- **Related:** [ADR-001](./001-modules-workflows-edges.md), [migration plan](./001-migration-plan.md)
- **Depends on:** ADR-001 (modules, workflows, and edges)

## 1. Context

ADR-001 defines the shape of the API: modules with commands, queries and prepare functions; integration events; a unit of work; workflows and policies; one edge per client. It does not define helpers that turn that shape into code. Today, the patterns are written out by hand in every module:

| Area | Today | Approx. size |
|---|---|---|
| Composition root | `composition-root.ts` builds every adapter and handler set by hand | ~735 lines |
| Route mounting | `app.ts` calls about 15 `register*Routes(app, deps)` functions in turn | ~405 lines |
| Handler wiring | `create-*-handlers.ts` in 10 modules, mostly wrapping each handler in `withCommandLog` | ~713 lines |
| Command shape | `decide → plan → persist → apply`, repeated in ~60 `handle-*` files | n/a |
| HTTP adapters | every route repeats `implement(contract)`, then calls the handler, then maps the error | n/a |

ADR-001's migration will add more code of this kind: edge mapping, integration event mappers, published `prepare` functions, and fake participants for the in-memory unit of work. The pressure to abstract will grow during the migration. That is also when abstracting is most likely to go wrong, because the final shape won't be settled yet.

## 2. Decision

**Defer designing a module kit until ADR-001's migration is complete.** Until then, follow the patterns by hand, and record evidence in the lessons log (§5).

## 3. Scope limits (already agreed)

Any future kit must stay within these limits:

- **Plain functions and types only.** No dependency-injection container, decorators, lifecycle hooks, reflection or automatic wiring.
- **The composition root stays explicit and readable.** The kit may shorten it, but must not hide what is wired to what.
- **It must not replace or weaken enforcement.** ESLint boundaries and the table-ownership test remain the source of truth for dependency rules. The kit may add type-level checks on top of them.
- **It must suit the functional core.** Results, values and pure functions throughout. No class hierarchies.
- **It lives inside `apps/api`** (for example under `kernel/` and `platform/`) until there is a second consumer. No separate package before then.
- **It must be adoptable one module and one edge at a time,** following expand/migrate/contract. Hand-written and kit-based modules must be able to coexist.

## 4. Open questions for the full ADR

These are to be answered from the lessons log, not predicted:

1. **Module contract:** Is a `defineModule({ ports, commands, queries, prepare, events })` helper useful, or is the `index.ts` type from ADR-001 §4.3 enough?
2. **Handler tables:** Can command handlers be declared as a table (name, handler, logging metadata), with wrapping such as command logging applied uniformly?
3. **Exposing commands through edges:** How do several edges expose the same module command, each with its own contract and response mapping, without copy-pasted adapters?
4. **Integration event mapping:** Is mapping domain events to integration events regular enough to generate or declare in a table?
5. **Unit-of-work participants:** Can each module declare its persistence compiler and its fake snapshot/restore once, and have both the SQLite and the in-memory unit of work use that declaration?
6. **Test harness:** Can the kit provide helpers for module-level tests (an in-memory unit of work plus fakes) and edge-level tests?
7. **Composition:** Can mounting edges and registering policies become declarative lists while staying explicit?
8. **Cost check:** For each candidate helper, does it remove more code and confusion than it adds in generic types and indirection?

## 5. Lessons log

Each migration task under ADR-001 adds entries here when it hits repeated boilerplate, wiring pain, or a pattern that didn't fit. Keep entries short and factual: what was repeated, where, how many times, and what would have helped.

| Date | Task / phase | Observation | Where (files) | Repeats | Possible kit feature |
|---|---|---|---|---|---|
| 2026-11-06 | M0.5 | none | — | — | — |
| 2026-11-06 | M1.1 | none | — | — | — |
| 2026-11-06 | M1.2 | none | — | — | — |
| 2026-11-06 | M1.3 | none | — | — | — |
| 2026-11-06 | M2.1 | none | — | — | — |
| 2026-11-06 | M2.2 | none | — | — | — |
| 2026-11-06 | M2.3 | none | — | — | — |
| 2026-11-06 | M2.4 | none | — | — | — |
| 2026-11-06 | M0.3 | none | — | — | — |
| 2026-11-06 | M3.1 | none | — | — | — |
| 2026-11-06 | M4.1 | Two commit loops, not one shared runner. SQLite opens `transaction('write')` and awaits `execute` once per compiled statement. The in-memory unit of work is a separate snapshot loop. | `apps/api/src/platform/unit-of-work/sqlite-unit-of-work.ts`, `in-memory-unit-of-work.ts` | 2 | Not yet. One batch is M4.1b, not a kit. |
| 2026-11-08 | M4.1b | The unit of work is the persistence adapter for a frozen domain Result. Conflict is the guarded statement whose `rowsAffected` is 0. A thrown batch or commit is Storage for the whole batch, because the driver error has no statement index. Replaying that batch one statement at a time would drop atomicity, so the adapter does not do it. HTTP 500 is the edge mapping of Storage. The domain does not parse SQLite. SQLite and in-memory stay two loops. | `apps/api/src/platform/unit-of-work/sqlite-unit-of-work.ts`, `in-memory-unit-of-work.ts`, `kernel/unit-of-work.ts` | 2 loops | No kit. One batch is the adapter, not a shared runner. |
| 2026-11-06 | M4.2 | none | — | — | — |
| 2026-11-06 | M4.3 | One empty sink. The composition root builds `createHistoryEventSink` with `EMPTY_EVENT_SINK_MAP` once and passes that same object to both unit-of-work factories. No route calls `commit`. There is no repeated builder table. | `apps/api/src/composition-root.ts`, `modules/history/domain/event-sink.ts` | 1 | Nothing to generate until a module emits events. |
| 2026-11-06 | M3.2 | One registrar. `app.ts` calls `registerPublicApiV1`, which mounts the frozen procedures at `/api/v1` and the `/api` alias. No second client edge uses that shape. | `apps/api/src/app.ts`, `edges/public-api/v1/register.ts` | 1 | A declarative edge list is early until a second edge mounts the same way. |
| 2026-11-07 | M3.3 | none | — | — | — |
| 2026-11-07 | M3.4 | none | — | — | — |
| 2026-11-07 | M3.5 | none | — | — | — |
| 2026-11-08 | M3.6 | The HTTP adapter is the ops edge, not a domain module. `mapHealthCheckError` maps `HealthCheckError` to `ORPCError` in `edges/ops/orpc-health-errors.ts`. `platform/health` still returns `ResultAsync<HealthStatus, HealthCheckError>`. `apps/api/src/health` is gone. | `edges/ops/orpc-health-errors.ts`, `edges/ops/orpc-health-routes.ts`, `platform/health/health-errors.ts` | 1 adapter | No kit. The edge owns the HTTP error. The platform checker stays a Result. |
| 2026-11-07 | M3.7 | The platform migration runner cannot import tests, so it takes a `seed` callback and the caller passes `seedMigrationTestData`. The two helpers are `*.test.ts`, which the ownership scanner already skips, and Vitest excludes exactly those two paths so they are not collected as suites. Ten allowlist rows were removed (the file had 10 `removedBy: 'M7.5'` rows, not 21). None were retargeted. Allowlist 43 to 33. No production exemption. App root, ESLint rules, and the baseline were not changed. | `platform/database/migration-test-runner.ts`, `tests/helpers/migration-seed.test.ts`, `tests/helpers/seed-test-user-session.test.ts`, `apps/api/vitest.config.ts` | 2 helpers, 10 rows | That `*.test.ts` shape is what landed. The approved correction restores non-test names and has not landed. |
| 2026-11-09 | M3.7 | The helpers are `migration-seed.ts` and `seed-test-user-session.ts` under `src/tests/helpers/`. The scanner exempts that directory only. The same INSERT outside it is still a violation, including elsewhere under `src/tests/` and in production infrastructure. Vitest does not exclude the helpers. Every `*.test.ts` file has an `it` or `test` call. The allowlist stays 33. The platform runner still takes a seed callback and does not import the helper. | `platform/table-ownership.ts`, `tests/helpers/migration-seed.ts`, `tests/helpers/seed-test-user-session.ts`, `apps/api/vitest.config.ts` | 2 helpers | No kit. One directory rule, not a production allowlist. |
| 2026-11-07 | M5.1-check | none | — | — | — |
| 2026-11-08 | LINT-ACCEPTANCE | Quality runs `turbo run lint` with no package exclude, so `@yoink/acceptance-tests` lint is included. Build, typecheck, and test still use `--filter=!@yoink/acceptance-tests`, so the browser suite stays in the E2E job. Four unused bindings were dropped and the awaited calls stayed. | `package.json`, `packages/acceptance-tests/src/use-cases/project-import.test.ts`, `single-rail-and-direct-list-screens.test.ts`, `task-row-no-pin.test.ts` | 4 bindings | No kit. Lint coverage is the quality script, not a module helper. |
| 2026-11-09 | TOKEN-LIST | The list handler was already one function passed to both the v1 handler and the alias handler. Create, revoke, and reissue stay on the client-only registrar. The new tests call those mounts. No second mapper or composition step was added. | `apps/api/src/edges/public-api/v1/tokens.ts` | 1 list function, 2 mounts already | No kit. Pinning the two mounts did not add an adapter. |
| 2026-11-09 | M5.1 | Target layer rules cannot turn on while captures imports `@yoink/api-contracts`. A current element `src/modules/captures/**` (full, before `module-*`) keeps the live warning count at 150. The old `src/captures/**` pattern stays for boundary fixtures. Do not allow `@yoink/api-contracts` on `module-domain`. History must not import captures: builders in `modules/history/domain/capture-timeline.ts` match event type strings, and the sink assigns record ids. `VISIBLE_TIMELINE_SQL` stays limited to task, project, and note. `toTimelineEntry` returns null for capture kinds. The public timeline contract does not gain capture. `existsClause` still cannot write a capture row (`SELECT 1 WHERE 0`); capture rows go through `changeLogInsert`. Those guards stay for M4.4. Commands prepare a plan, then `uow.commit` sends one `tx.batch`. A guarded `markProcessed` miss is `Conflict` for `captures` with reason `guard-miss`, and the batch rolls back. A thrown batch is `Storage` with `owners`. The domain does not parse the driver error. A nonempty libsql transaction needs a file database. A second `:memory:` client is a different database, so memory keeps one connection and one gate. `client.transaction()` on a file database detaches the connection and `close()` after `COMMIT` does not close it. Each capture commit then leaks a native handle, and the process segfaults in `index.node`. The file write client runs `BEGIN IMMEDIATE`, the statements, and `COMMIT` on its own connection, and a gate keeps two write transactions off that connection. Queries use a second connection to the same file, with their own gate, in WAL mode. Sharing the write gate queued signup reads behind every open commit, and one invite validation then missed the 10s Email wait while the API was still healthy. Remote libsql still uses `client.transaction()`. Empty-trash `deletedCount` is a read before commit because commit returns void. `captureSnapshot` and `markAsProcessed` stay on the store until M5.5. The new fake participant delegates its snapshot to that store. The HTTP error mapper moved to the public-api edge. Its processing imports stay visible warnings. Production public-api still does not allow projects, processing, or access. The captures table had no allowlist row of its own. The cross-module round trip lives in `src/tests` because neither module may import the other. Bootstrapped HTTP tests cannot stay on `:memory:` once a command commits: `tests/helpers/test-app.ts` gives each app its own file. | `modules/captures/`, `modules/history/domain/capture-timeline.ts`, `eslint.config.js`, `src/tests/capture-event-roundtrip.test.ts`, `platform/database/database.ts` | one pilot | Keep the current-element blanket until M5.11. Do not extract a kit from one module. |
| 2026-11-09 | M5.12 | `tx.batch` either returns every `rowsAffected` or throws with no statement index. When a guarded insert can decline, every later statement that references the declined row must also be conditional (`INSERT` or `UPDATE` … `WHERE EXISTS`). The expected conflict then stays `rowsAffected` 0 and `Conflict`. A throw would be `Storage`. Signup in [#342](https://github.com/jmhill/yoink/pull/342) is the first example. The user insert is `INSERT … SELECT … WHERE NOT EXISTS`. The later membership, invitation, event, credential, and session writes are conditional on that user. | `apps/api/src/access/infrastructure/persistence/compile-signup.ts` | 1 signup batch | No kit. The participant compiles the conditional statements. |
| 2026-11-09 | M5.13-admin | One access participant compiles signup and the admin plans. A second participant cannot also own `access`. Dispatch is a `kind` guard, then a hand-written `compile`. Admin create-member does not guard the user insert: a duplicate email still throws, and the batch is Storage. The user-name update is the only guard, and it has no later statement. | `apps/api/src/access/infrastructure/persistence/access-sql-participant.ts`, `compile-admin.ts`, `compile-signup.ts` | 8 admin plans, 1 signup plan | No kit. A plan table would hide the statements. |
| 2026-11-09 | M5.13-admin-session | Admin session has no table, so it does not join `accessSqlParticipant`. Login and verify are pure decisions. SHA-256 and HMAC are one infrastructure port. The participant only frames `base64url(session JSON).hmac`. `challenge.ts` is not imported here. | `access/domain/decide-admin-session.ts`, `access/infrastructure/node-admin-session-crypto.ts`, `access/infrastructure/admin-session-participant.ts` | 1 plan, 1 crypto port | No kit. A second SQL participant would claim `access`. |
| 2026-11-09 | M5.11-captures | One function copies the defined capture fields onto the contract capture, in the document's field order. Create, get, update, trash, restore, snooze, and unsnooze call it. List maps each item and then uses the existing list body. The capture document and the contract capture are the same fields. Removing the `src/modules/captures/**` current element retargets the existing processing and tasks warnings from type `captures` to the layer (`module-domain`, `module-fakes`, or `module-infrastructure`). The count stays 150 (117 `boundaries/element-types`, 33 `@typescript-eslint/no-explicit-any`). Module tests already import the fake clock, the in-memory unit of work, and the test database. Store tests import `capture-store.contract.ts`. Those allows were missing. `@yoink/api-contracts` stays off `module-domain`. The folder-mode `src/captures/**` pattern stays for the boundary fixtures. The allowlist stays 33. Captures had no row. | `modules/captures/domain/model/capture.ts`, `edges/public-api/v1/map-capture.ts`, `eslint.config.js` | 1 mapper, 7 capture returns, 1 list | No kit. The edge copies fields. |
| 2026-11-09 | M6.1 | The second client edge writes its own mount: log, token auth, then `handle` with a prefix. The contract path stays `/captures`. OpenAPILink concatenates the origin pathname with that absolute path, so the extension origin is `{apiUrl}/extension-api/v1`. The public API registrar is not reused. Its procedure list and alias headers do not belong on this edge. The create and list error maps are copied so this edge does not import `public-api`. | `apps/api/src/edges/extension/v1/register.ts`, `edges/public-api/v1/mount.ts`, `apps/extension/src/lib/api-client.ts` | 2 mounts, 2 error maps | No kit. A shared registrar would hide the prefix and the alias. |
| 2026-11-09 | M6.2 | The web edge writes its own mount: build log, combined auth, then `handle` with prefix `/web-api`. The contract path stays `/inbox`. OpenAPILink joins origin `/web-api` with that path. The public API registrar is not reused. Create and list error maps are copied so this edge does not import `public-api`. Combined auth is the existing `authMiddleware`, not a second limiter. Inbox list and create only. Process, trash, and snooze stay on `/api`. | `apps/api/src/edges/web/register.ts`, `apps/api/src/edges/extension/v1/register.ts`, `apps/web/src/api/client.ts` | 3 mounts, copied error maps | No kit. A shared registrar would hide the prefix and combined auth. |
| 2026-11-09 | M5.2 | `StorageError` was copied four times and is one type. `TaskNotFound`, `TaskNotOpen`, `ProjectDone`, `ProjectProposed`, `ListNotInOrganization`, and `AssigneeNotInOrganization` share names and differ in fields (`taskId` versus `id`, a `message` or not, `field` on the task error). Unifying those would change the unions the HTTP mappers switch on. `LoadTask`, `LoadProject`, and `LoadNextOpenOrder` were the same port. `LoadNamedList` was not: tasks and lists return `NamedList`, and the project next-action port returns only `id` and `organizationId`. The current-element blanket `src/modules/task-management/**` (full, before `module-*`) is the captures shape, because the module still imports `@yoink/api-contracts`. HTTP error mappers moved to the public-api edge. | `modules/task-management/domain/messages/storage-error.ts`, `application/ports.ts`, `eslint.config.js`, `edges/public-api/v1/orpc-*-errors.ts` | 4 storage errors, 3 shared ports, 1 narrower list port | No kit. One shared error and the ports that already matched. The HTTP mapper stays on the edge. |
| 2026-11-10 | M5.3 | One commit can hold several guards, so `Conflict.reason` is the `-- guard:<reason>` comment. Without it, duplicate-name and import-not-pending both become `guard-miss`. The history sink appends after the module step, so `changes()` cannot see the domain write. `clearNextAction` keeps its if-changed insert in the task-management step through `changeLogInsert`. An import task insert is conditional on the project row, so a declined project insert stays `Conflict` instead of a thrown foreign key. | `platform/unit-of-work/sqlite-unit-of-work.ts`, `modules/task-management/infrastructure/persistence/compile-task-management-plan.ts`, `modules/history/infrastructure/sqlite-event-sink.ts` | 4 guard reasons | No kit. The participant compiles the statements. The comment is read by the unit of work. |

## 6. When to start the full ADR

Write ADR-002 in full only when **all** of these hold:

- ADR-001's migration is complete and every ADR-001 enforcement rule is at `error`.
- At least three modules and two edges follow the final ADR-001 pattern.
- The lessons log has been reviewed and grouped by theme.
- At least one theme shows repetition across three or more modules or edges.

If the review shows that the remaining boilerplate is acceptable, record that outcome here and close this ADR as **Rejected (not needed)**.

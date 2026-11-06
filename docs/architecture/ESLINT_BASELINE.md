# ESLint baseline

Measured **2026-11-06** on the M1.1 working tree branched from `ceeb49c6b0557837810fd927030ed049c6ea43ea` (`main`). `apps/api/eslint.config.js` in this change is the config under test. Counts come from the commands in [How this was measured](#how-this-was-measured).

The previous measurement is M0.5, on `11da9800fe063d0e7b168a320dd1a61d69da1dcc`, merged as `93584ce`. That run is not restated as if this config had been in place. Its totals were **4 errors** and **196 warnings** (`boundaries/element-types` 112, `boundaries/no-unknown` 19, `@typescript-eslint/no-explicit-any` 33, `react-hooks/set-state-in-effect` 25, `react-hooks/exhaustive-deps` 7).

## Result

`pnpm lint` **exits 1**. The failure is the same 4 **errors** in `@yoink/acceptance-tests`. This run's finished packages report **212 warnings**.

| Package | Errors | Warnings | eslint summary |
|---|---:|---:|---|
| `@yoink/acceptance-tests` | 4 | 0 | `✖ 4 problems (4 errors, 0 warnings)` |
| `@yoink/api` | 0 | 180 | `✖ 180 problems (0 errors, 180 warnings)` |
| `@yoink/web` | 0 | 32 | `✖ 32 problems (0 errors, 32 warnings)` |
| `@yoink/acceptance-testing` | 0 | 0 | no diagnostics, exit 0 |
| `@yoink/admin` | 0 | 0 | no diagnostics, exit 0 |
| `@yoink/api-contracts` | 0 | 0 | no diagnostics, exit 0 |
| `@yoink/extension` | 0 | 0 | no diagnostics, exit 0 |
| `@yoink/infrastructure` | 0 | 0 | no diagnostics, exit 0 |
| `@yoink/notes-mirror` | 0 | 0 | no diagnostics, exit 0 |
| `@yoink/ui-base` | 0 | 0 | no diagnostics, exit 0 |
| **Total** | **4** | **212** | |

Plain `pnpm lint` does not print an API summary. Turbo cancelled that in-flight task after acceptance-tests failed. Web did finish and printed 32 warnings. The table is from `pnpm lint --force --continue`, which let every package finish and still exited 1.

`pnpm quality` is `turbo run lint build typecheck test --filter=!@yoink/acceptance-tests`. It does not lint the package that owns the 4 errors. On this tree, `mise exec -- pnpm quality` exited 0: 33 successful / 33 total, 30 cached, 39.484s. `@yoink/api` test was a cache miss: 244 files, 1893 passed, 38.54s. No test timed out.

## Counts per rule

Parsed from the continue run. Package totals match the eslint `✖` lines: 147 + 33 = 180 API warnings, 25 + 7 = 32 web warnings.

| Rule | Reported as | Configured level | Count | Where |
|---|---|---|---:|---|
| `boundaries/element-types` | warning | `warn` | 147 | `@yoink/api` |
| `boundaries/no-unknown` | warning | `warn` | 0 | `@yoink/api` |
| `boundaries/entry-point` | warning | `warn` | 0 | `@yoink/api` |
| `boundaries/external` | warning | `warn` | 0 | `@yoink/api` |
| `@typescript-eslint/no-explicit-any` | warning | `warn` | 33 | `@yoink/api` |
| `react-hooks/set-state-in-effect` | warning | `warn` | 25 | `@yoink/web` |
| `react-hooks/exhaustive-deps` | warning | `warn` | 7 | `@yoink/web` |
| `@typescript-eslint/no-unused-vars` | error | `error` | 4 | `@yoink/acceptance-tests` |

`no-restricted-imports` stays `error` on `src/**/{domain,application}/**/*.ts`, tests excluded. It produced no diagnostic on this tree.

`boundaries/entry-point` and `boundaries/external` are on at `warn`. They produced no diagnostic because nothing under `apps/api/src` lives in the target layout yet. That is not a suppressed warning. See [Target rules](#target-rules).

## Delta from the M0.5 measurement

Warnings went from 196 to 212 (**+16**). Errors stayed 4. The move is coverage, not a cleanup.

| | M0.5 | M1.1 | Change |
|---|---:|---:|---|
| `boundaries/element-types` | 112 | 147 | +35 |
| `boundaries/no-unknown` | 19 | 0 | −19 |
| other rules | 65 | 65 | 0 |
| **warnings** | **196** | **212** | **+16** |

The +35 element-types warnings are the old 19 unknown imports, now typed and disallowed, plus 16 imports in `notes`, `review`, and `work`, which the old config did not visit. 112 + 19 + 16 = 147.

Every M0.5 element-types pair is still present at the same count. Those 112 were not removed to shrink the baseline. `@typescript-eslint/no-explicit-any` is still 33, in the same three access tests. The web hooks warnings are still 25 and 7. The four unused locals are still the four errors below.

## How this was measured

### Scope

`pnpm lint` is `turbo run lint`. Turbo 2.10.11 ran the `lint` script in these 10 packages (remote caching disabled):

`@yoink/acceptance-testing`, `@yoink/acceptance-tests`, `@yoink/admin`, `@yoink/api`, `@yoink/api-contracts`, `@yoink/extension`, `@yoink/infrastructure`, `@yoink/notes-mirror`, `@yoink/ui-base`, `@yoink/web`.

Each script is `eslint` over that package's `src/**/*.{ts,tsx}` (several packages also include `js`/`jsx`). `boundaries/*` rules are enabled only in `apps/api/eslint.config.js`. The other packages use `eslint.config.base.js`.

### Tool versions on the run

| Tool | Version |
|---|---|
| Node | v24.22.2 (`mise.toml` pins Node 24; this run used `mise exec`) |
| pnpm | 11.24.0 |
| Turbo | 2.10.11 |
| ESLint | 10.9.0 |
| `@eslint/js` | 10.0.1 |
| `@typescript-eslint/eslint-plugin` and `parser` | 8.67.0 |
| `eslint-plugin-boundaries` | 5.4.0 |
| `@boundaries/elements` | 1.2.0 |
| `eslint-import-resolver-typescript` | 4.4.5 |
| `eslint-plugin-react-hooks` | 7.1.1 |
| TypeScript | 5.9.3 |

Installed rule ids are `boundaries/element-types`, `boundaries/entry-point`, `boundaries/external`, `boundaries/no-unknown`, `boundaries/no-unknown-files`, `boundaries/no-ignored`, and `boundaries/no-private`. The four ADR names match. No rename was required. `no-unknown-files`, `no-ignored`, and `no-private` are not enabled.

`apps/api` still sets `import/resolver` to `eslint-import-resolver-typescript` with the API `tsconfig.json`.

### Plain `pnpm lint` (exit 1, API cancelled)

```text
Tasks:    8 successful, 10 total
Cached:    8 cached, 10 total
  Time:    3.054s
Failed:    @yoink/acceptance-tests#lint
```

`@yoink/acceptance-tests#lint` exited 1 and printed the 4 errors below. `@yoink/web:lint` finished first and printed `✖ 32 problems (0 errors, 32 warnings)`. Turbo then reported `[ELIFECYCLE] Command failed` for in-flight `@yoink/api#lint` with no eslint summary.

### Complete census: `pnpm lint --force --continue` (exit 1)

This forwards to `turbo run lint --force --continue`. `--continue` lets API finish after acceptance-tests fails. `--force` was required because the plain run had already cached the packages it finished.

```text
Tasks:    9 successful, 10 total
Cached:    0 cached, 10 total
  Time:    11.968s
Failed:    @yoink/acceptance-tests#lint
```

Exit code was still 1. The 9 successes are the 7 clean packages plus API and web (warnings only).

### `pnpm quality` (exit 0)

```text
Tasks:    33 successful, 33 total
Cached:    30 cached, 33 total
  Time:    39.484s
```

`@yoink/api` lint was a cache hit of the continue run above. `@yoink/api` build, typecheck, and test executed. API tests: 244 files, 1893 passed, 38.54s.

## Element classification

`@boundaries/elements` 1.2.0 describes all **729** `apps/api/src/**/*.{ts,tsx}` files. **0** are unknown. `boundaries/no-unknown` is 0 for that reason: every local import resolves to a typed file.

Folder mode is still the default. Until a parent matches, the matcher tests `pattern/**/*` against the path suffix, so `src/app.ts` never matched `src/app.ts`. A `mode: 'full'` pattern is tested against the whole path on the first pass, and the first match wins. A full-mode `src/**/*.test.ts` would take `src/access/foo.test.ts` before the access directory pattern could, and those files would stop being type `access`. That would drop warnings. It is not used.

Current directories stay folder mode, including colocated tests. Exact files, `src/tests/**`, and `src/*.test.ts` are `mode: 'full'`. Target patterns are also `mode: 'full'` and are listed before the directory they sit in, so a `*.test.ts` under `modules/*/domain/` is `module-test`, not `module-domain`.

| Type | Files |
|---|---:|
| `access` | 177 |
| `projects` | 84 |
| `database` | 81 |
| `tasks` | 59 |
| `captures` | 52 |
| `lists` | 48 |
| `notes` | 46 |
| `shared` | 42 |
| `review` | 33 |
| `work` | 20 |
| `listing` | 18 |
| `processing` | 15 |
| `history` | 12 |
| `tests` | 12 |
| `health` | 9 |
| `logging` | 9 |
| `entrypoint` | 4 |
| `config` | 3 |
| `server` | 3 |
| `app` | 1 |
| `composition` | 1 |

`server` is `src/json-body.ts`, `src/static-cache-control.ts`, and `src/trust-proxy.ts`. `tests` is `src/tests/**` plus root `src/*.test.ts` (7 files), not colocated feature tests. `src/access/application/organization-routes.test.ts` is type `access`. No production file is a target type (`module-*`, `workflow-*`, `edge*`, `kernel`, `platform*`). Those patterns are registered and match only when a file is there.

## `boundaries/element-types` (147 warnings)

Enabled at `warn`. Default is `disallow`. 64 of the 147 are in `*.test.ts` files. 83 are in other files. A test under `src/access/**` is type `access`, so the feature rule applies to it.

The old `from: '*'` allow of `shared`, `listing`, `config`, `database`, and `logging` is now the same allow from the current-layout types by name. A `from: '*'` rule would have granted that list to target layers. Naming the current types leaves today's allows in place. `notes`, `review`, and `work` may import themselves, on top of that shared set. They are not on the shared allow list. `server` may import `server`.

### Unchanged pairs (112)

These are the M0.5 pairs, at the same counts.

| From | To | Warnings |
|---|---|---:|
| `projects` | `tasks` | 31 |
| `processing` | `captures` | 19 |
| `processing` | `projects` | 14 |
| `processing` | `tasks` | 13 |
| `tasks` | `projects` | 9 |
| `access` | `projects` | 5 |
| `captures` | `processing` | 4 |
| `lists` | `tasks` | 4 |
| `processing` | `lists` | 3 |
| `captures` | `access` | 2 |
| `health` | `access` | 2 |
| `captures` | `projects` | 1 |
| `lists` | `access` | 1 |
| `logging` | `history` | 1 |
| `projects` | `access` | 1 |
| `tasks` | `access` | 1 |
| `tasks` | `captures` | 1 |

### Reclassified unknown imports (19)

M0.5 reported these as `boundaries/no-unknown` because `src/tests/helpers/test-app.ts` and `src/composition-root.ts` matched no element. Both files now have a type (`tests` and `composition`). Feature modules are not allowed to import them, so the same imports warn as `element-types`. None of the 19 was deleted.

| From | To | Warnings | What |
|---|---|---:|---|
| `projects` | `tests` | 5 | `src/tests/helpers/test-app.ts` |
| `tasks` | `tests` | 4 | `src/tests/helpers/test-app.ts` |
| `access` | `tests` | 2 | `src/tests/helpers/test-app.ts` |
| `captures` | `tests` | 2 | `src/tests/helpers/test-app.ts` |
| `lists` | `tests` | 2 | `src/tests/helpers/test-app.ts` |
| `health` | `tests` | 1 | `src/tests/helpers/test-app.ts` |
| `history` | `tests` | 1 | `src/tests/helpers/test-app.ts` |
| `processing` | `tests` | 1 | `src/tests/helpers/test-app.ts` |
| `access` | `composition` | 1 | `access/application/http-owner-invite-routes.test.ts` imports `composition-root.ts` |

### Newly checked `notes`, `review`, and `work` (16)

These files had no element type in M0.5, so their imports were not visited. They are visited now. The warnings are the rule applying, not a behavior change.

| File | From | To |
|---|---|---|
| `notes/infrastructure/http-note-routes.ts` | `notes` | `access` |
| `notes/infrastructure/http-note-routes.test.ts` | `notes` | `tests` |
| `review/infrastructure/http-review-routes.ts` | `review` | `access` |
| `review/infrastructure/http-review-fixture-routes.ts` | `review` | `access` |
| `review/infrastructure/parse-review-row.ts` | `review` | `projects` |
| `review/infrastructure/parse-done-row.ts` | `review` | `projects` |
| `review/infrastructure/parse-done-row.ts` | `review` | `tasks` |
| `review/infrastructure/sqlite-review-store.test.ts` | `review` | `projects` |
| `review/infrastructure/sqlite-review-store.test.ts` | `review` | `tasks` |
| `review/infrastructure/http-review-routes.test.ts` | `review` | `tests` |
| `work/infrastructure/http-work-routes.ts` | `work` | `access` |
| `work/infrastructure/parse-now-next-action-row.ts` | `work` | `tasks` |
| `work/infrastructure/sqlite-work-store.ts` | `work` | `tasks` |
| `work/infrastructure/sqlite-work-store.test.ts` | `work` | `projects` |
| `work/infrastructure/sqlite-work-store.test.ts` | `work` | `tasks` |
| `work/infrastructure/http-work-routes.test.ts` | `work` | `tests` |

`app.ts` and `composition-root.ts` import notes, review, and work. They are type `app` and `composition`, which may import anything, so those imports do not warn. In M0.5 they did not warn either, because both files were unknown. The count does not drop.

## `boundaries/no-unknown` (0 warnings)

The rule still runs at `warn`. It reports a local resolved import whose file has no element type. npm packages are not this rule. With every `apps/api/src` file typed, the count is 0.

## Target rules

ADR §10 rules 1–7 are registered at `warn`. Nothing promotes them to `error`.

v5 `entry-point` has no `from`. It only looks at the target element's `internalPath`, and it skips imports inside one element. Layer files are separate element types so element-types can tell domain from application from infrastructure. Entry-point's default is `disallow`. Current-layout types and target layer types allow `**` (a single `*` does not match `domain/foo.ts`). `module-entry` and `workflow-entry` allow `index.ts`. `module-testing` allows `testing.ts`. Who may import `testing.ts` is element-types: test types only. A later `from: '*'` disallow of `module-testing` overrides `allow: '*'` on `app`, `composition`, and `entrypoint`, and the test types opt back in.

`external` default is `disallow`. Domain, application, module entry, module testing, kernel, and workflow layers allow `neverthrow` and `zod`. Module infrastructure allows Fastify, `@fastify/*`, `@orpc/*`, `@libsql/client`, `@sentry/node`, `@simplewebauthn/server`, and `node:*` (baseSource of `node:fs/promises` is `node:fs`). Platform adds `@yoink/infrastructure`. Edges add `@yoink/api-contracts`. `@yoink/api-contracts` is not on the module lists, so a module import warns, including `import type` (the plugin's default import nodes include type imports). Current-layout types allow `*` and `**`, because `*` does not match a scoped baseSource such as `@yoink/api-contracts`. That keeps today's files with no new external warning.

Workspace packages resolve outside `apps/api`, so the plugin would treat them as local and `external` would not see them. `boundaries/flag-as-external` names `@yoink/api-contracts` and `@yoink/infrastructure`. Current types still allow every external source.

There is no `workflows/*/infrastructure` element. A file there would be unknown. An import of it from a typed file would be `no-unknown`.

These rules were checked with temporary files under `src/modules`, `src/workflows`, `src/edges`, `src/kernel`, and `src/platform`, then deleted before the census. They are not in the tree and not in the counts above. The check showed:

- same-module domain imports are allowed, and `access` domain importing `captures` domain warns
- application importing its own infrastructure warns, and `no-restricted-imports` is still an error on that import
- a module `index.ts` may import its application and may not import its infrastructure
- a workflow may import `modules/access/index.ts` and may not import `modules/access/domain/`
- an edge may import module and workflow index files and `platform/clock.ts`, and may not import `platform/database` or `testing.ts`
- `edges/test-fixtures` may import `platform/database`
- `platform/database` may not import a module index, and may import `@libsql/client`
- kernel may import `neverthrow` and may not import `fastify`
- `import type` from `@yoink/api-contracts` warns in module domain and infrastructure, and `@yoink/infrastructure` warns in domain and does not warn in platform

## `@typescript-eslint/no-explicit-any` (33 warnings)

Configured at `warn` in `eslint.config.base.js`. All 33 are in `@yoink/api` access tests, unchanged from M0.5:

| File | Warnings |
|---|---:|
| `apps/api/src/access/domain/passkey-service.test.ts` | 21 |
| `apps/api/src/access/application/auth-routes.test.ts` | 8 |
| `apps/api/src/access/application/passkey-routes.test.ts` | 4 |

## `react-hooks/set-state-in-effect` (25 warnings)

Configured at `warn` in `eslint.config.base.js` for `src/**/*.{tsx,jsx}`. All 25 are in `@yoink/web`. Unchanged from M0.5: 20 in `src/components/`, 5 in `src/routes/`.

| File | Warnings |
|---|---:|
| `src/components/security-section.tsx` | 3 |
| `src/components/invitations-section.tsx` | 2 |
| `src/components/organizations-section.tsx` | 2 |
| `src/components/tokens-section.tsx` | 2 |
| `src/routes/signup.tsx` | 2 |
| `src/components/confirm-proposal-sheet.tsx` | 1 |
| `src/components/edit-project-dialog.tsx` | 1 |
| `src/components/members-section.tsx` | 1 |
| `src/components/next-action-picker.tsx` | 1 |
| `src/components/note-editor-sheet.tsx` | 1 |
| `src/components/process-item.tsx` | 1 |
| `src/components/process-project-sheet.tsx` | 1 |
| `src/components/project-status-control.tsx` | 1 |
| `src/components/promote-sheet.tsx` | 1 |
| `src/components/proposal-edit-sheet.tsx` | 1 |
| `src/components/task-edit-modal.tsx` | 1 |
| `src/routes/_authenticated/settings.tsx` | 1 |
| `src/routes/_authenticated/tasks.tsx` | 1 |
| `src/routes/share.tsx` | 1 |

## `react-hooks/exhaustive-deps` (7 warnings)

Configured at `warn` in `eslint.config.base.js`. All 7 are in `@yoink/web`, one per file. Unchanged from M0.5.

- `src/components/invitations-section.tsx`
- `src/components/members-section.tsx`
- `src/components/process-item.tsx`
- `src/routes/_authenticated/process.tsx`
- `src/routes/_authenticated/projects_.$projectId.tsx`
- `src/routes/_authenticated/tasks.tsx`
- `src/routes/signup.tsx`

## `@typescript-eslint/no-unused-vars` (4 errors)

Configured as `error` in `eslint.config.base.js` (names matching `/^_/` are allowed). These four are why `pnpm lint` exits 1. They are unchanged. This task does not edit them. They are outside `pnpm quality`.

| File | Line | Name |
|---|---:|---|
| `packages/acceptance-tests/src/use-cases/project-import.test.ts` | 524 | `staged` |
| `packages/acceptance-tests/src/use-cases/single-rail-and-direct-list-screens.test.ts` | 140 | `mineMilk` |
| `packages/acceptance-tests/src/use-cases/task-row-no-pin.test.ts` | 30 | `eggs` |
| `packages/acceptance-tests/src/use-cases/task-row-no-pin.test.ts` | 31 | `bread` |

## What this baseline is

The measured warning set after registering current and target elements and ADR §10 rules 1–7 at `warn`. Rules are not promoted to `error`. Production behavior is unchanged. oRPC stays `2.0.0-beta.48` and Zod stays on 3. The 212 warnings are the baseline later tasks must not grow, except where a move genuinely subjects new files to a target rule that this tree does not contain yet.

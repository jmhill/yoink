# ESLint baseline

Measured **2026-11-06** against commit `11da9800fe063d0e7b168a320dd1a61d69da1dcc` (`main` at the time of the run). Lint configuration was left as it was. This write-up replaces the 2026-07-29 text in this file. Counts below come from the commands in [How this was measured](#how-this-was-measured).

## Result

`pnpm lint` **exits 1**. The failure is 4 **errors**. The same run's finished packages also report **196 warnings**. Warnings do not fail a package: Turbo marked `@yoink/api` and `@yoink/web` successful after they printed warnings.

| Package | Errors | Warnings | eslint summary |
|---|---:|---:|---|
| `@yoink/acceptance-tests` | 4 | 0 | `✖ 4 problems (4 errors, 0 warnings)` |
| `@yoink/api` | 0 | 164 | `✖ 164 problems (0 errors, 164 warnings)` |
| `@yoink/web` | 0 | 32 | `✖ 32 problems (0 errors, 32 warnings)` |
| `@yoink/acceptance-testing` | 0 | 0 | no diagnostics, exit 0 |
| `@yoink/admin` | 0 | 0 | no diagnostics, exit 0 |
| `@yoink/api-contracts` | 0 | 0 | no diagnostics, exit 0 |
| `@yoink/extension` | 0 | 0 | no diagnostics, exit 0 |
| `@yoink/infrastructure` | 0 | 0 | no diagnostics, exit 0 |
| `@yoink/notes-mirror` | 0 | 0 | no diagnostics, exit 0 |
| `@yoink/ui-base` | 0 | 0 | no diagnostics, exit 0 |
| **Total** | **4** | **196** | |

Plain `pnpm lint` does not print the API or web summaries. Turbo cancelled those two in-flight tasks after acceptance-tests failed. The table is from `pnpm lint --force --continue`, which let every package finish and still exited 1. See below.

## Counts per rule

Parsed from that continue run. Package totals match the eslint `✖` lines: 112 + 19 + 33 = 164 API warnings, 25 + 7 = 32 web warnings.

| Rule | Reported as | Configured level | Count | Where |
|---|---|---|---:|---|
| `boundaries/element-types` | warning | `warn` | 112 | `@yoink/api` |
| `boundaries/no-unknown` | warning | `warn` | 19 | `@yoink/api` |
| `@typescript-eslint/no-explicit-any` | warning | `warn` | 33 | `@yoink/api` |
| `react-hooks/set-state-in-effect` | warning | `warn` | 25 | `@yoink/web` |
| `react-hooks/exhaustive-deps` | warning | `warn` | 7 | `@yoink/web` |
| `@typescript-eslint/no-unused-vars` | error | `error` | 4 | `@yoink/acceptance-tests` |

`no-restricted-imports` is configured as `error` on `apps/api/src/**/{domain,application}/**/*.ts`, with tests excluded. It produced no diagnostic. No other rule produced a diagnostic in this run.

## How this was measured

### Scope

`pnpm lint` is `turbo run lint`. Turbo 2.10.11 ran the `lint` script in these 10 packages (remote caching disabled):

`@yoink/acceptance-testing`, `@yoink/acceptance-tests`, `@yoink/admin`, `@yoink/api`, `@yoink/api-contracts`, `@yoink/extension`, `@yoink/infrastructure`, `@yoink/notes-mirror`, `@yoink/ui-base`, `@yoink/web`.

Each script is `eslint` over that package's `src/**/*.{ts,tsx}` (several packages also include `js`/`jsx`). `boundaries/*` rules are enabled only in `apps/api/eslint.config.js`. The other packages use `eslint.config.base.js`.

### Tool versions on the run

| Tool | Version |
|---|---|
| Node | v24.22.2 (`mise.toml` pins Node 24; mise was not on `PATH`, so this was nvm's Node 24. The machine default `node` was v22.23.4 and was not used) |
| pnpm | 11.24.0 (matches `packageManager`) |
| Turbo | 2.10.11 |
| ESLint | 10.9.0 |
| `@eslint/js` | 10.0.1 |
| `@typescript-eslint/eslint-plugin` and `parser` | 8.67.0 |
| `eslint-plugin-boundaries` | 5.4.0 |
| `@boundaries/elements` (dependency of that plugin) | 1.2.0 |
| `eslint-import-resolver-typescript` | 4.4.5 |
| `eslint-plugin-react-hooks` | 7.1.1 |
| TypeScript | 5.9.3 |

`apps/api` still sets `import/resolver` to `eslint-import-resolver-typescript` with the API `tsconfig.json`, so ESM `.js` specifiers can be matched back to `.ts` files. That setting was not changed.

### Plain `pnpm lint` (exit 1, incomplete)

```text
Tasks:    7 successful, 10 total
Cached:    0 cached, 10 total
  Time:    9.358s
Failed:    @yoink/acceptance-tests#lint
```

`@yoink/acceptance-tests#lint` exited 1 and printed the 4 errors below. Turbo then reported `[ELIFECYCLE] Command failed` for the in-flight `@yoink/api#lint` and `@yoink/web#lint` tasks. Those two printed no eslint summary, so this invocation is not a full warning census.

### Complete census: `pnpm lint --force --continue` (exit 1)

This forwards to `turbo run lint --force --continue`.

- `--continue` keeps going after a package failure, so API and web finish.
- `--force` was used because the plain run above had already filled the Turbo cache for the packages it managed to finish. A clean tree can use `pnpm lint --continue` without `--force`.

```text
Tasks:    9 successful, 10 total
Cached:    0 cached, 10 total
  Time:    11.112s
Failed:    @yoink/acceptance-tests#lint
```

Exit code was still 1. The 9 successes are the 7 clean packages plus API and web (warnings only).

## `boundaries/element-types` (112 warnings)

Enabled at `warn` in `apps/api` only. Default policy is `disallow`. A warning is an import from one recognized element to a different recognized element that the allow-list does not permit. The message is `No rule allowing this dependency was found. File is of type '<from>'. Dependency is of type '<to>'`.

Allowances that produced no warnings in this run:

- every element may import `shared`, `listing`, `config`, `database`, and `logging`
- `history` may import `projects` and `tasks`
- `projects` and `tasks` may import `history`
- `access`, `captures`, `health`, `lists`, and `processing` may import their own type
- `app`, `composition`, `entrypoint`, and `tests` are allowed to import anything, and those four elements currently match no files (see [Element omissions](#element-omissions))

38 of the 112 warnings are in `*.test.ts` files inside a registered directory. 74 are in other files. A test file under `src/access/**` (and the other directory elements) is typed as that directory, so the module rule applies to the colocated test. The `tests` pattern does not take those files.

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

Groups:

- **Processing reaches other feature directories (49).** `processing` may import only `processing` plus the shared set. The 49 warnings are `captures` (19), `projects` (14), `tasks` (13), and `lists` (3, all in tests). They sit in processing `domain`, `application`, and `infrastructure`.
- **Projects and tasks import each other (40), plus a few task/list test imports (5).** `projects` → `tasks` is 31 (22 non-test, 9 test) across projects `domain`, `application`, and `infrastructure`. `tasks` → `projects` is 9 (7 non-test, 2 test). `projects` may import `history`, and `tasks` may import `history`; neither may import the other. On top of that, lists tests import tasks (4) and one tasks test imports a captures fake (1).
- **Access imports projects (5).** `access/domain/admin-service.ts` imports `ProjectStore` and `projectNotFoundError`. `access/domain/admin-errors.ts` imports project error types. Two tests import `createFakeProjectStore`.
- **HTTP adapters import access, and captures imports processing (10).** `AuthMiddleware` from `access/application/index.js` is imported by captures routes (2, including one test), `lists/infrastructure/http-list-routes.ts` (1), `projects/infrastructure/http-project-routes.ts` (1), and `tasks/infrastructure/http-task-routes.ts` (1). Captures infrastructure also imports processing handler/error types (4) and `projectRequestValidationError` (1).
- **Health imports access (2).** `health/infrastructure/sqlite-health-checker.ts` imports the `TokenStore` type. Its test imports `createFakeTokenStore`.
- **Logging imports history (1).** `logging/history-read-logger.ts` imports the `HistoryReadLogger` type from `history/application/ports.js`.

## `boundaries/no-unknown` (19 warnings)

Enabled at `warn` in `apps/api` only. All 19 are warnings in `*.test.ts` files that the plugin typed as a module element. The message is `Importing unknown elements is not allowed`. The rule reports a local file that resolved and matched no element. npm packages are not in this count.

| Importer directory | Warnings | Import |
|---|---:|---|
| `projects` | 5 | `src/tests/helpers/test-app.ts` |
| `tasks` | 4 | `src/tests/helpers/test-app.ts` |
| `access` | 2 | `src/tests/helpers/test-app.ts` |
| `captures` | 2 | `src/tests/helpers/test-app.ts` |
| `lists` | 2 | `src/tests/helpers/test-app.ts` |
| `health` | 1 | `src/tests/helpers/test-app.ts` |
| `history` | 1 | `src/tests/helpers/test-app.ts` |
| `processing` | 1 | `src/tests/helpers/test-app.ts` |
| `access` | 1 | `src/composition-root.ts` (`access/application/http-owner-invite-routes.test.ts`) |

18 warnings are the shared HTTP test helper. One is the composition root. None of the 19 is an import of `notes`, `review`, or `work`.

## Element omissions

`apps/api/eslint.config.js` registers these elements. This task did not edit that file.

Directory patterns: `access`, `captures`, `config`, `database`, `health`, `history`, `listing`, `lists`, `logging`, `processing`, `projects`, `shared`, `tasks`.

Exact-file patterns: `app` (`src/app.ts`), `composition` (`src/composition-root.ts`), `entrypoint` (`src/index.ts`, `src/instrument.ts`, `src/migrate.ts`, `src/test-migrations.ts`), `tests` (`src/**/*.test.ts`).

### `notes`, `review`, and `work` are not registered

Those three directories exist under `apps/api/src`. On this tree they hold 34, 22, and 16 non-test TypeScript files, and 12, 11, and 4 colocated tests. They are not in `boundaries/elements`.

They add **zero** warnings, and that is a hole in coverage.

`boundaries/element-types` and `boundaries/no-unknown` are dependency rules. In `eslint-plugin-boundaries` 5.4.0, the rule visits a file only when that file already has an element type. A file under `notes/`, `review/`, or `work/` is skipped, so its own imports are not checked. The same unknown helper that accounts for 18 warnings above is imported by `notes/infrastructure/http-note-routes.test.ts`, `review/infrastructure/http-review-routes.test.ts`, and `work/infrastructure/http-work-routes.test.ts`, and those three files contribute no diagnostic.

The production files that import those directories are `src/app.ts` and `src/composition-root.ts` (note, work, and review handlers and stores). Both files are themselves unknown to the plugin, so those imports are not reported either. Detail next.

### Registered exact-file elements match no files

A separate debug trace, `ESLINT_PLUGIN_BOUNDARIES_DEBUG=1` with the same ESLint 10.9.0 and `eslint-plugin-boundaries` 5.4.0, classified these paths as unknown type:

- `src/app.ts`, `src/composition-root.ts`
- `src/index.ts`, `src/instrument.ts`, `src/migrate.ts`, `src/test-migrations.ts`
- `src/composition-root.test.ts`, `src/tests/composition/auth-wiring.test.ts`
- `src/notes/application/create-note-handlers.ts`, `src/review/application/create-review-handlers.ts`, `src/work/application/create-work-handlers.ts`
- `src/json-body.ts`, `src/static-cache-control.ts`, `src/trust-proxy.ts`
- `src/tests/helpers/test-app.ts`, `src/tests/helpers/http-client.ts`

The same trace typed `src/access/application/http-owner-invite-routes.test.ts` as `access`, and typed its imports of `../../composition-root.js` and `../../tests/helpers/test-app.js` as unknown. That matches the two `no-unknown` warnings in that file.

The plugin's default element mode is `folder` (`@boundaries/elements` 1.2.0). Descriptors in `apps/api/eslint.config.js` do not set `mode`. In folder mode, until a parent element has matched, the matcher uses `pattern/**/*`. A directory pattern such as `src/access/**` still matches files under `access`. An exact file pattern such as `src/app.ts` becomes `src/app.ts/**/*` and does not match `src/app.ts`. The `tests` pattern `src/**/*.test.ts` becomes `src/**/*.test.ts/**/*` and does not match a test file. Test files are typed only when they sit inside a directory element.

So the registered `app`, `composition`, `entrypoint`, and `tests` elements currently classify no files. Their allow-all rules do not apply to any file in this run. `no-unknown-files` is not enabled, so an unknown file is not itself a warning. It shows up only when a file that does have a type imports it.

Other unknown files that produced no diagnostic of their own in `pnpm lint`:

- `src/json-body.ts`, `src/static-cache-control.ts`, and `src/trust-proxy.ts` are imported from `src/app.ts`, which is unknown.
- `src/tests/helpers/http-client.ts` has no importer under `apps/api/src`.
- Root tests such as `src/json-body.test.ts`, `src/trust-proxy.test.ts`, `src/static-cache-control.test.ts`, and `src/rate-limit.test.ts` are unknown, so their imports of those root modules and of `test-app.ts` are not checked.

Registering `notes`, `review`, and `work`, and making the exact-file elements actually match, is M1.1. This baseline does not change the config.

## `@typescript-eslint/no-explicit-any` (33 warnings)

Configured at `warn` in `eslint.config.base.js`. All 33 are in `@yoink/api` access tests:

| File | Warnings |
|---|---:|
| `apps/api/src/access/domain/passkey-service.test.ts` | 21 |
| `apps/api/src/access/application/auth-routes.test.ts` | 8 |
| `apps/api/src/access/application/passkey-routes.test.ts` | 4 |

No other package reported this rule.

## `react-hooks/set-state-in-effect` (25 warnings)

Configured at `warn` in `eslint.config.base.js` for `src/**/*.{tsx,jsx}`. All 25 are in `@yoink/web`. The message is the plugin's "Calling setState synchronously within an effect" warning. 20 are in `src/components/`, 5 in `src/routes/`.

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

Configured at `warn` in `eslint.config.base.js`. All 7 are in `@yoink/web`, one per file. Each is a `useEffect` missing a dependency (`loadInvitations`, `loadMembers`, `closeSnoozeMenu`, `proposalActions`, `membersQuery`, or `handleValidateCode`).

- `src/components/invitations-section.tsx`
- `src/components/members-section.tsx`
- `src/components/process-item.tsx`
- `src/routes/_authenticated/process.tsx`
- `src/routes/_authenticated/projects_.$projectId.tsx`
- `src/routes/_authenticated/tasks.tsx`
- `src/routes/signup.tsx`

No other `react-hooks/*` rule fired. `@yoink/admin`, `@yoink/extension`, and `@yoink/ui-base` use the same base config and reported no hooks diagnostics.

## `@typescript-eslint/no-unused-vars` (4 errors)

Configured as `error` in `eslint.config.base.js` (names matching `/^_/` are allowed). These four are why `pnpm lint` exits 1. They were already present on the measured commit. This baseline does not change them.

| File | Line | Name |
|---|---:|---|
| `packages/acceptance-tests/src/use-cases/project-import.test.ts` | 524 | `staged` |
| `packages/acceptance-tests/src/use-cases/single-rail-and-direct-list-screens.test.ts` | 140 | `mineMilk` |
| `packages/acceptance-tests/src/use-cases/task-row-no-pin.test.ts` | 30 | `eggs` |
| `packages/acceptance-tests/src/use-cases/task-row-no-pin.test.ts` | 31 | `bread` |

## What this baseline is

A record of one lint run on unchanged config. `boundaries/element-types` and `boundaries/no-unknown` stay at `warn`. The 4 unused-var errors stay errors. oRPC stays at `2.0.0-beta.48` and Zod stays at `^3.24.0` in `apps/api`; this task did not touch dependencies.

`pnpm quality` includes `pnpm lint`, so it fails on the same 4 errors. This document does not claim that `pnpm quality` passed, and it does not claim a docs-only CI run.

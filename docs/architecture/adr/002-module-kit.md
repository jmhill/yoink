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

## 6. When to start the full ADR

Write ADR-002 in full only when **all** of these hold:

- ADR-001's migration is complete and every ADR-001 enforcement rule is at `error`.
- At least three modules and two edges follow the final ADR-001 pattern.
- The lessons log has been reviewed and grouped by theme.
- At least one theme shows repetition across three or more modules or edges.

If the review shows that the remaining boilerplate is acceptable, record that outcome here and close this ADR as **Rejected (not needed)**.

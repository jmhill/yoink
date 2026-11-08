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
| 2026-11-06 | M4.1 | none | — | — | — |
| 2026-11-06 | M4.2 | none | — | — | — |
| 2026-11-06 | M4.3 | none | — | — | — |
| 2026-11-06 | M3.2 | none | — | — | — |
| 2026-11-07 | M3.3 | none | — | — | — |
| 2026-11-07 | M3.4 | none | — | — | — |
| 2026-11-07 | M3.5 | none | — | — | — |
| 2026-11-07 | M3.6 | none | — | — | — |
| 2026-11-07 | M5.1-check | none | — | — | — |
| 2026-11-07 | M5.1 | Target layer rules cannot turn on while captures imports `@yoink/api-contracts`. A current element `src/modules/captures/**` (full, before `module-*`) keeps the live warning count at 150. The old `src/captures/**` pattern stays for boundary fixtures. Do not allow `@yoink/api-contracts` on `module-domain`. History must not import captures: builders in `modules/history/domain/capture-timeline.ts` match event type strings, and the sink assigns record ids. `VISIBLE_TIMELINE_SQL` stays limited to task, project, and note. `toTimelineEntry` returns null for capture kinds. The public timeline contract does not gain capture. `existsClause` still cannot write a capture row (`SELECT 1 WHERE 0`); capture rows go through `changeLogInsert`. Those guards stay for M4.4. A nonempty libsql transaction needs a file database and the same client `openDatabase` returned. A second `:memory:` client is a different database. Empty-trash `deletedCount` is a read before commit because commit returns void. `captureSnapshot` and `markAsProcessed` stay on the store until M5.5. The new fake participant delegates its snapshot to that store. The HTTP error mapper moved to the public-api edge. Its processing imports stay visible warnings. Production public-api still does not allow projects, processing, or access. The captures table had no allowlist row of its own. The cross-module round trip lives in `src/tests` because neither module may import the other. Bootstrapped HTTP tests cannot stay on `:memory:` once a command commits: `tests/helpers/test-app.ts` gives each app its own file. | `modules/captures/`, `modules/history/domain/capture-timeline.ts`, `eslint.config.js`, `src/tests/capture-event-roundtrip.test.ts` | one pilot | Keep the current-element blanket until M5.11. Do not extract a kit from one module. |

## 6. When to start the full ADR

Write ADR-002 in full only when **all** of these hold:

- ADR-001's migration is complete and every ADR-001 enforcement rule is at `error`.
- At least three modules and two edges follow the final ADR-001 pattern.
- The lessons log has been reviewed and grouped by theme.
- At least one theme shows repetition across three or more modules or edges.

If the review shows that the remaining boilerplate is acceptable, record that outcome here and close this ADR as **Rejected (not needed)**.

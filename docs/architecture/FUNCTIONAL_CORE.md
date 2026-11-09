# Functional Core (Captures Pilot)

**Status:** Pilot — `captures/` plus `lists/` view/create/rename/delete/list-open-tasks/reorder (named list or unlisted pile) plus task create/PATCH/complete/uncomplete/pin/unpin/delete plus `projects/` create/update/list/get
**Created:** 2026-08-19
**Amended by:** [ADR-001: Modules, workflows, and edges](./adr/001-modules-workflows-edges.md) (2026-11-06). The decide → plan → persist pattern below still applies inside every module. The **module layout**, **ports**, **persistence** (unit of work) and **cross-module rules** are now defined by ADR-001 §3–§7. Where this document and ADR-001 disagree, ADR-001 wins.

The captures module is an I/O sandwich: a pure core decides, adapters persist and serve HTTP. `lists/` uses the same shape for view (query loads and returns) and create/rename/delete/reorder (decide → `planListChange` → persist). Task create, PATCH (set or clear `listId`), complete, uncomplete, pin, unpin, and delete use the same sandwich (`decide` → `planTaskChange` → persist). The handler plans once (pre-generated ids, `occurredAt` on the event) and returns that view. Persist only turns the plan into SQL statements in one `db.batch`. Do not copy this shape into access until the pilot is judged a success. Token checks are the one exception: `decideValidateToken` is a pure query over loaded facts, I/O stays in the token service, and the HTTP mapping lives in the auth middleware.

## Layers

This is the pilot's current layout. The target layout (`modules/<name>/` with folder buckets, one `index.ts`, no HTTP code in modules) is ADR-001 §4.

```
captures/
  domain/            # pure — types + decide_* + apply
    capture-commands.ts
    events.ts        # log-ready facts, not entity snapshots
    decide-*.ts
    apply-capture-event.ts
    capture-errors.ts
  application/       # sandwich — the module’s public port
    handle-*.ts
    create-capture-handlers.ts
    ports.ts         # PersistCaptureEvent, LoadCapture, ListCaptures
  infrastructure/    # adapters
    store-backed-persist.ts    # event → existing CaptureStore
    sqlite-capture-store.ts    # leftover CRUD (processing still uses it)
    orpc-*-routes.ts           # oRPC OpenAPI adapters (domain stays Result)
                               # Result stays in the handler; only this adapter throws ORPCError
```

## Flow

```
HTTP adapter          application handler           domain
     │                        │                       │
     │  command               │                       │
     ├───────────────────────►│  load (if needed)     │
     │                        │  id, now              │
     │                        ├──────────────────────►│ decide_*
     │                        │◄──── event / error ───┤
     │                        │  persist(event, current)
     │                        │  view = apply(state, event)
     │◄── event + view ───────┤
     │  status + body         │
```

- `decide_*` takes values (`command`, current state, `id`, `now`). No I/O, no clock port, no store.
- Events are facts (`CaptureCreated { id, content, capturedAt, ... }`), not `{ capture: Capture }`.
- `applyCaptureEvent` is a pure projector used for HTTP views and for the store-backed persist adapter.
- Queries (`list`, `find`) load and return. No fake events.
- Empty-trash is a command: `decideEmptyTrash` emits `CaptureTrashEmptied { organizationId }`. Persist permanently deletes trashed captures (not inbox) and returns `deletedCount` as an adapter outcome, not as part of the fact.

## What not to extract yet

The sandwich is the reusable idea, not a generic handler type. Create, update-ish, empty-trash, and queries already differ on load, `Noop`, persist outcome, and whether `apply` can produce a view. Pull a shared `handleWrite` only when a second module needs the same ports.

## What stayed out of this pilot

Superseded. ADR-001 and its [migration plan](./adr/001-migration-plan.md) now cover each of these:
- processing becomes a workflow (M5.5)
- store objects become internal to persistence (M5 checklist)
- modules get their own types instead of `@yoink/api-contracts` (M5.11)
- access moves to this pattern (M5.12, M5.13)

## Success checks

- HTTP routes only map. No rules, no clock, no store.
- `decide_*` tests have no fakes except values.
- Handler tests can persist to an in-memory event list without changing decide/handlers.
- Existing capture acceptance tests stay green.

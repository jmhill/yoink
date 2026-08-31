# Functional Core (Captures Pilot)

**Status:** Pilot — `captures/` plus `lists/` create/list  
**Created:** 2026-08-19

The captures module is an I/O sandwich: a pure core decides, adapters persist and serve HTTP. `lists/` uses the same shape for view (query loads and returns) and create (decide → persist → apply). Other modules still use service objects in `domain/` and HTTP in `application/`. Do not copy this shape into access until the pilot is judged a success.

## Layers

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
    http-capture-routes.ts     # ts-rest: body+auth → command; event/view → status/body
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

- `ProcessCaptureToTask` still lives in `processing/` and talks to `CaptureStore` directly.
- `CaptureStore` remains for processing and as the persist adapter’s backend.
- Capture entity type is still the HTTP Zod schema from `@yoink/api-contracts`.
- Signup / access is unchanged.

## Success checks

- HTTP routes only map. No rules, no clock, no store.
- `decide_*` tests have no fakes except values.
- Handler tests can persist to an in-memory event list without changing decide/handlers.
- Existing capture acceptance tests stay green.

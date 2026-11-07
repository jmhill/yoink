# ADR-001: Modules, workflows, and edges

- **Status:** Accepted. The unit-of-work spike is done on main (U1, `0d2a87077dce8dbdd0bbf0546607adb01ed9ca29`, [#312](https://github.com/jmhill/yoink/pull/312)). The oRPC spread pattern is done on main (`b30fe62241ef3335fc058d34f100f55b4a3672e1`, [#313](https://github.com/jmhill/yoink/pull/313)). M3.1's frozen copy is done on main (`198616d599acacd71b3e64203e62eb0ee5bc139d`, [#315](https://github.com/jmhill/yoink/pull/315)). M4.2's history move is done on main (`a445f0ec62bbe822c770eb2cefc4b9a8aa1423fc`, [#316](https://github.com/jmhill/yoink/pull/316)). M4.3's empty history sink is done on main (`eb4fcf4ae007d178b2b9346ebf1c03880da374a6`, [#318](https://github.com/jmhill/yoink/pull/318)). M3.2's public API edge is done on main (`0a1b7aa7b4d532663c7cd27194bba82cd3527a31`, [#317](https://github.com/jmhill/yoink/pull/317)). M5.1-check is done on main (`3729b977c1cf2da5baa2e58cb99a8c0facb47942`, [#319](https://github.com/jmhill/yoink/pull/319)). M5.1 has not started. M3.3 is done on main (`0959d7d6d4f855a74331f08a485d8dd6a72321cf`, [#320](https://github.com/jmhill/yoink/pull/320)). M3.4 is done on main (`67e24d6b4e5d5f76db883679cf3cf6983ff4c598`, [#321](https://github.com/jmhill/yoink/pull/321)): health is in `edges/ops/` and fixtures are at `/test-api/`. M3.5 is done on main (`f422e83d14b1bb066f461d406b0b6eeaf9b821f6`, [#322](https://github.com/jmhill/yoink/pull/322)): auth middleware is in `edges/_shared/auth/`. M3.6 is in progress: HTTP tests sit next to the edge routes, not done until review and merge. M4 stays open. M4.4 remains.
- **Date:** 2026-11-06
- **Deciders:** Justin
- **Migration plan:** [001-migration-plan.md](./001-migration-plan.md)
- **Supersedes:** `docs/architecture/MODULAR_MONOLITH.md`, `docs/architecture/DOMAIN_EVENTS.md`
- **Amends:** `docs/architecture/FUNCTIONAL_CORE.md` (the layer pattern inside a module stays; the module layout and the "what stayed out" sections are replaced by this ADR), `apps/api/AGENTS.md`

## 1. Context

The API (`apps/api`) uses the functional core / I/O sandwich pattern inside most modules, and that works well. The structure around and between modules has not kept up:

- **Flat layer folders.** Each `domain/`, `application/` and `infrastructure/` folder is one undifferentiated pile of files (access/domain alone has 63 non-test files).
- **Storage coupling between modules.** Modules read and write each other's tables:
  - processing inserts into `tasks` and `projects` and updates `captures`, using other modules' row statements
  - tasks soft-deletes `captures`
  - notes updates `organizations`
  - review reads `tasks`, `projects`, `change_log` and `organizations`
  - work reads `tasks`, `projects` and `lists`
  - history reads `tasks`, `projects`, `project_notes` and `users`
  - notes reads `organization_memberships` and joins `projects` and `users`
  - five modules write `change_log` directly
  - several guards are SQL `EXISTS` clauses that read another module's table
- **Cyclic, entity-shaped modules.** tasks ↔ projects ↔ lists call each other's `decide-*`, `plan-*` and persistence in both directions. This is Nygard's entity-service antipattern happening inside one process.
- **Screen-shaped modules.** `work` owns no state; it exists only to serve the Work screen. Review's current endpoints are the same.
- **One HTTP surface for every client.** Web, admin, the extension and bots share routes. `combined-auth-middleware` accepts a session or a token on the same endpoints, and UI-driven changes risk breaking integrations.
- **HTTP adapters in the wrong layer.** They live in `application/` in access and health, and in `infrastructure/` everywhere else.
- **Enforcement is partial.** One `error` rule (domain/application ↛ infrastructure) and module-level `boundaries` rules at `warn` (112 warnings; notes, review and work aren't registered at all).
- **The domain depends on outer layers.** 81 domain files import HTTP contract types from `@yoink/api-contracts`. A few import `config`, `node:crypto` or `@simplewebauthn/server`.
- **Cross-module atomicity has a history.** `withTransaction` was removed (`4e7afab`, `d1e3625`) because issuing `BEGIN` through `db.execute()` doesn't work over Turso HTTP. Since then, atomicity has relied on `db.batch` statements whose guards read other modules' tables.

Why now: upcoming product work needs clear homes, and each item would deepen today's coupling:
- a Goals → Milestones → Projects → Tasks hierarchy
- daily plans and time blocking
- review sessions with their own state
- an MCP client for agents

Design references: Nygard, *[Services by Lifecycle](https://www.michaelnygard.com/blog/2018/01/services-by-lifecycle/)* and *The Entity Service Antipattern*; Wlaschin, *Domain Modeling Made Functional* (workflows as pipelines, documents and events at boundaries, railway-oriented errors); the onion / hexagonal dependency rule; the Backends-for-Frontends pattern.

## 2. Decision summary

1. The API is a **modular monolith** with four kinds of building block: **modules** (bounded contexts that own state), **workflows** (cross-module orchestration that owns no state), **edges** (one HTTP surface per client), and a **kernel / platform** (shared code with no business ownership).
2. **Modules are organized by lifecycle, not by entity.** tasks, projects and lists merge into **Task Management**. `work` is dissolved. Processing becomes a **workflow**.
3. **No storage dependencies between modules.** Each table has exactly one owning module, and only that module's infrastructure reads or writes it.
4. Modules interact **only through their public interfaces** (commands, queries, prepare, integration events), which the composition root adapts into **consumer-owned ports**. Modules never import each other. One `index.ts` per module.
5. **Atomic changes across modules** use a **unit of work**. Modules contribute prepared `Work`, and the unit of work (types in `kernel/`, implementation in `platform/`) commits it in one batch. Each module guards its own conditions.
6. **Cross-module rules** come in two kinds: **workflows** (orchestration, started by an intent) and **policies** (choreography, triggered by an integration event). Policies come in two flavours: same-transaction and eventual (the latter deferred).
7. **Integration events** are each module's published, versioned event contract, mapped from internal domain events. **History owns `change_log`** and is the unit of work's event sink.
8. **One backend-for-frontend (BFF) edge per client** (web, admin, extension), plus a **versioned public API** edge for bots, agents and integrations. Edges own both reads and writes for their client. Modules contain no HTTP code.
9. **The public API and the extension edge are versioned from the start** (`/api/v1`, `/extension-api/v1`): whole-API major versions with shared route code, and today's unversioned integration paths kept as a deprecated alias.
10. **Dependencies point inward:** edges → workflows and modules; workflows → modules; module infrastructure and edges → platform; everything → kernel. Within a module: infrastructure → application → domain. This is enforced by ESLint plus a table-ownership architecture test.

The rest of this document gives the detail.

## 3. Building blocks and layout

```
apps/api/src/
  edges/                     # all HTTP. One folder per client. No SQL, no business rules.
    web/                     # main Yoink web app        (user session auth; legacy token fallback until PLAN 7.7c)
    admin/                   # admin app                 (admin session auth)
    extension/               # browser extension         (API token auth)
    public-api/              # bots, agents, tools       (API token auth)
      v1/
    ops/                     # unversioned operational endpoints, e.g. /api/health
    test-fixtures/           # test-only; mounted only when fixtures are enabled
    _shared/                 # oRPC dispatch/handler options, error body, auth middleware, listed-page mapping
  workflows/                 # cross-module orchestration. No tables, no infrastructure/.
    processing/
  modules/                   # bounded contexts. Own state. In-process interfaces only.
    access/
    captures/
    task-management/
    notes/
    review/
    history/
    # planning/              # reserved: daily plans, time blocks (future)
  kernel/                    # pure shared code any layer may import
  platform/                  # database, migrations, config, logging, health checker, SQL helpers
  composition-root.ts        # builds platform, then modules, workflows, policies, then mounts edges
  app.ts                     # Fastify bootstrap (plugins, static apps, SPA fallback)
```

### 3.1 Modules

| Module | Owns (state) | Lifecycle stage | Notes |
|---|---|---|---|
| `access` | users, organizations, memberships, membership events, invitations, tokens, passkeys, sessions | (upstream of everything) | Unchanged scope. Its older services migrate to the functional pattern (§11) |
| `captures` | captures | Capture | |
| `task-management` | tasks, projects, lists, project imports; goals and milestones later | Organize | Merges `tasks/`, `projects/`, `lists/`. Hosts the Now and next-action queries. Absorbs the Goals → Milestones → Projects → Tasks redesign internally |
| `notes` | project notes, notes settings (including the designated mirror bot) | Reference | Separate context. Reads project data through Task Management queries |
| `review` | review sessions (future) | Reflect | Will have its own state. Until then, its edge views use Task Management queries |
| `history` | `change_log` | (cross-cutting) | Event sink for the unit of work. Owns timeline and history queries |
| `planning` | daily plans, time blocks (future) | Engage | Reserved name. Must not absorb Task Management's Now and next-action rules |

`health` stops being a module. The health checker moves to `platform/`, and `/api/health` (used by Fly's blue-green check) is served by `edges/ops/`.

### 3.2 Workflows

A workflow orchestrates one user intent that changes state in more than one module, atomically. It owns no tables and has no `infrastructure/`.

```
workflows/processing/
  domain/        # pure rules for its stage (e.g. "default task title = truncated capture content")
  application/   # handlers: query → prepare in each module → commit once
  policies/      # policies this workflow owns (see §6.3)
  index.ts
```

Current inventory: **processing** (capture → task, capture → project).

### 3.3 Edges

See §8.

### 3.4 Kernel and platform

**`kernel/`** is pure code with no I/O that any layer may import:
- `Actor` and auth context types
- `Result` helpers
- keyset and listing primitives (`listing/domain/*`)
- ISO date and viewer-today helpers
- `Clock` and `IdGenerator` port *types*
- `CommandLogger` and `HistoryReadLogger` port types, and `withCommandLog`
- `ModuleName`
- unit-of-work types (`Work`, `Step`, `StepFailure`, `UnitOfWork`, `Policy`, `SqlParticipant`, `FakeParticipant`, `GuardedStatement`)
- the integration event envelope type

**`platform/`** is infrastructure shared by all modules:
- `Database` and migrations
- config and logging
- the SQLite unit-of-work implementation
- the in-memory unit of work used in tests
- SQL keyset helpers (`page-sqlite`, `sql-keyset`)
- health checker
- real `Clock`, `IdGenerator` and `PasswordHasher` implementations

`@yoink/infrastructure` is split so that port types are kernel code and implementations are platform code. Renaming the package can be done later.

**`edges/_shared/`** holds code shared by edges only:
- oRPC plumbing
- auth middlewares
- request validation and error mapping
- rate limiting
- the listed-page mapping
- `server/`: the Fastify plumbing used by `app.ts` (JSON body parsing, trust proxy, static cache control)

Fastify plumbing stays out of `platform/` so modules' infrastructure can't import HTTP code.

### 3.5 Where today's code goes

| Today | Goes to | Notes |
|---|---|---|
| `tasks/`, `projects/`, `lists/` | `modules/task-management/` | Merged |
| `work/` | queries → `modules/task-management/`; screen composition → `edges/web/` | Dissolved |
| `processing/` | `workflows/processing/` | |
| `access/`, `captures/`, `notes/`, `review/`, `history/` | `modules/<same name>/` | Their HTTP code moves to edges |
| `health/` | checker → `platform/health/`; routes → `edges/ops/` | The checker pings the database through access's `TokenStore.hasAnyTokens()` (debt marked `TODO(8.5.4)`). It becomes a plain database connectivity check, which removes the dependency on access |
| `config/`, `database/` (including migrations) | `platform/config/`, `platform/database/` | |
| `logging/` (logger, Sentry, command logger, history read logger) | `platform/logging/` | The `CommandLogger` and `HistoryReadLogger` port *types* go to `kernel/` |
| `shared/change-log/application/command-log.ts` (`withCommandLog`) | `kernel/` | A higher-order function over an injected `CommandLogger` port, with no I/O imports |
| `shared/change-log/domain/`, `shared/change-log/infrastructure/` | `modules/history/` | History owns the change log |
| `shared/auth-context.ts`, `shared/name.ts`, `shared/domain/*` | `kernel/` | |
| `shared/request-validation.ts`, `shared/infrastructure/request-validation-http.ts`, `shared/infrastructure/parse-json.ts` | `edges/_shared/` | `lists/domain` and `projects/domain` currently import `request-validation`. That's domain code depending on HTTP validation, and it gets fixed when those modules migrate |
| `shared/rate-limit-policy.ts`, `shared/request-client-ip.ts`, `shared/in-memory-rate-limit-consume.ts` | `edges/_shared/` | |
| `shared/orpc/*` | `edges/_shared/orpc/` | |
| `listing/domain/*`, `listing/application/*` | `kernel/listing/` | Pure code |
| `listing/infrastructure/page-sqlite.ts`, `sql-keyset.ts` | `platform/sql/` | |
| `listing/infrastructure/http-listed-page.ts` | `edges/_shared/` | |
| `json-body.ts`, `trust-proxy.ts`, `static-cache-control.ts` | `edges/_shared/server/` | |
| `app.ts`, `composition-root.ts`, `index.ts`, `instrument.ts`, `migrate.ts`, `test-migrations.ts` | stay at `src/` root | Entry points and wiring |
| `tests/` (composition tests, `test-app`, `http-client`) | stay at `src/tests/` | |

## 4. Inside a module

### 4.1 Layers and the dependency rule

```
modules/<name>/
  domain/            # pure: types, decisions, projections, rules. Imports: own domain, kernel.
  application/       # sandwich: handlers, ports, public interface factory. Imports: own domain+application, kernel.
  infrastructure/    # adapters: persistence, fakes. Imports: own module, kernel, platform. Never other modules, workflows or edges.
  index.ts           # the ONLY public entry point (no per-layer barrels)
  testing.ts         # test-only entry point: fake-backed factory and fake participants (§10)
```

- **Modules never import other modules.** See §4.4.
- The **domain** does no I/O and calls no ports. It must not import application, infrastructure, platform, config, `node:*`, Fastify, oRPC, libsql, Sentry or SimpleWebAuthn. The exception is the legacy services listed in §11, until they're migrated.
- **Ports belong to the application layer** (`application/ports.ts`): function types such as `LoadTask` and `PersistTaskChange`. Store-object interfaces (`domain/*-store.ts`) are legacy. They become internal details of persistence and are removed as each module migrates.
- **Modules own their types.** Domain and application code must not depend on `@yoink/api-contracts`. Edges map module documents to contract types. During migration, type-only imports of `@yoink/api-contracts` are allowed with a lint warning. A module switches to its own types when it gets its new public interface.

### 4.2 Folder buckets

A layer gets subfolders only when it holds more than about 10 non-test files. Test files sit next to their source.

| Layer | Bucket | Contents |
|---|---|---|
| domain | `model/` | entity and value types, value objects, constants |
| | `messages/` | `*-commands`, `*-queries`, domain `events`, `*-errors` |
| | `decisions/` | `decide-*` |
| | `projections/` | `apply-*-event`, `plan-*` |
| | `rules/` | pure policy and helper rules that aren't decisions |
| application | (root) | `ports.ts`, `create-<module>.ts` (the public interface factory, e.g. `create-task-management.ts`) |
| | `handlers/` | `handle-*` |
| | `support/` | shared handler helpers (`load-owned-*`, `write-result`, …) |
| | `integration-events/` | integration event types, plus mappers from domain events to integration events |
| infrastructure | (root) | port contract tests (`*.contract.ts`), run against both persistence and fakes |
| | `persistence/` | port implementations (SQLite), the unit-of-work participant (plan → guarded statements) |
| | `persistence/rows/` | row statements and row parsers |
| | `fakes/` | in-memory port implementations, plus the in-memory unit-of-work participant |

- Domain events live in `domain/messages/`.
- Integration events live in `application/integration-events/` and are exported through `index.ts`.
- Layer-level barrels (e.g. `access/application/index.ts`, `access/infrastructure/index.ts`) are removed.
- Legacy buckets that shrink to zero during migration: `domain/ports/` (store interfaces) and `domain/services/` (`*-service`).

### 4.3 Public interface

A module's `index.ts` exports one factory and the types it publishes:

```ts
export type TaskManagement = {
  commands: { /* intent-named, self-contained: prepare + commit internally */ };
  queries:  { /* question-named; return documents the module owns; may paginate */ };
  prepare:  { /* load + decide + plan; write nothing; return Work for a workflow or policy */ };
};
export type { /* published documents, input documents (e.g. TaskStarter), integration event types, refusal/error types */ };
export const createTaskManagement: (deps: TaskManagementDeps) => TaskManagement;
```

- **Commands are named by intent** (`completeTask`, `setNextAction`), not CRUD by entity.
- **Every command is "prepare, then commit."** A module's own guards therefore hold whether the change comes from one of its commands or from a workflow.
- **Queries return documents** whose types the module owns, never database rows.
- Only `prepare` functions that some workflow or policy actually uses get published.
- Consumers of a module's interface: workflows, edges and the composition root. Other modules never import it (§4.4).

### 4.4 Consumer-owned ports

When a module needs something from another module, it declares its **own port** in `application/ports.ts`, typed with **only the fields it uses**. The composition root adapts the other module's public query, prepare function or event to that port:

```ts
// modules/notes/application/ports.ts
export type LoadProjectForNote = (id: string) =>
  ResultAsync<{ id: string; organizationId: string; name: string } | null, StorageError>;

// composition-root.ts: the adapter maps the publisher's error type to the consumer's
loadProjectForNote: (id) => taskManagement.queries.projectById(id).mapErr(toNotesStorageError)
```

- **No code coupling between modules.** Only the composition root knows both sides.
- **Drift is caught at compile time, in one place.** If the publisher stops providing a field the consumer declared, the composition root's adapter fails to type-check.
- **The consumer sees only what it needs** and ignores the rest of the publisher's document.
- The same applies to event shapes. A policy that lives in a consuming module declares the event shape it reacts to, and the composition root wires it to the publisher's integration event.
- Workflows and edges still import modules' `index.ts`, because orchestration and mapping need the real `prepare`, `Work`, document and error types.

## 5. Interaction between modules

### 5.1 Table ownership

Every table has exactly one owner, recorded in a table-ownership map (§10). Only the owner's `infrastructure/` may reference it in SQL. `edges/test-fixtures/` is exempt.

| Table(s) | Owner |
|---|---|
| users, organizations, organization_memberships, membership_events, invitations, api_tokens, passkey_credentials, user_sessions | access |
| captures | captures |
| tasks, projects, lists, project_imports | task-management |
| project_notes, notes settings (new) | notes |
| change_log | history |
| _migrations, unit-of-work guard table | platform |

(This list was checked against migrations `001`–`043`. `change_log_new` and `invitations_new` were temporary rebuild tables.)

**Columns that belong to another module** move with expand/migrate/contract. `organizations.notes_mirror_bot_user_id` is notes data, so it moves to the new notes settings table: create the table, backfill it, switch reads and writes, then drop the column. `organizations.time_zone` stays with access; review reads it through a consumer-owned port.

**Foreign keys:**
- Foreign keys to access's **identity anchors** (`organizations.id`, `users.id`) are allowed. Every module is scoped by them, and they're stable.
- **Every other reference to another module's data is an opaque id, with no foreign key and never a cascade.**
- `ON DELETE CASCADE` must never cross a module boundary.
- The two existing cross-module foreign keys are removed by dedicated tasks:
  - `tasks.capture_id → captures(id)`
  - `project_notes.project_id → projects(id)`

### 5.2 How modules interact

| Need | Mechanism |
|---|---|
| Read another module's data | Use a **consumer-owned port** (§4.4), which the composition root adapts to the other module's query. Call it before your transaction starts |
| Refer to another module's entity | Store its **id only**. No foreign key, except to identity anchors (§5.1) |
| Change another module's state as part of one intent | A **workflow** (§6.2) |
| Keep an invariant that spans modules, whatever the entry point | A **policy** (§6.3) |
| Tell others something happened | Publish an **integration event** (§7) |

Reads between modules happen through queries. Reading never makes an operation a workflow. A module may query others, decide, and write only its own state. A check made before the transaction can be overtaken by a concurrent change (a time-of-check/time-of-use race). That's acceptable when the outcome is recoverable. Where it isn't, the rule must become a policy or a workflow.

Event-fed read models, where a module keeps its own copy built from integration events, are **deferred**. A module moves to that approach when it needs state of its own built from another module's history, or when serving it by query would distort the owner's interface.

### 5.3 Allowed module dependencies

Modules never import each other (§4.4), so these dependencies are **runtime** dependencies. They record whose public interface the composition root adapts into whose ports, which also fixes the order in which modules are built.

```
access ◄──────────────── every module and workflow (queries only)
captures                  ◄── workflows/processing
task-management           ◄── workflows/processing, notes, review, history, (planning)
notes                     ◄── history
history                   (consumes others' queries for lookups; no module consumes history, only edges do)
```

- Dependencies must form a DAG: no cycles between modules.
- The composition root wires modules in dependency order. A new adapter that would create a cycle is a design error and must be resolved by a workflow, a policy or a boundary change.
- History receives events through the unit-of-work sink, which the composition root wires. No module depends on history.
- **Heuristic:** if workflows keep accumulating between the same two modules, the boundary is wrong. Merge the modules or redraw the line. (This is how Task Management was found.)

### 5.4 Schema ownership

SQLite and libSQL have no Postgres-style schemas. Separate databases joined with `ATTACH` would break atomic cross-module commits: SQLite doesn't guarantee atomicity across attached databases in WAL mode, and on Turso `ATTACH` is read-oriented and needs extra configuration. Ownership is therefore **declared**, not physically separated:

- Each table's owner is recorded in the table-ownership map (§5.1, §10).
- The `Migration` type gains `owner: ModuleName | 'platform'`. **Every new migration must declare its owner.**
- A migration may only create, alter, rebuild or backfill tables its owner owns. The table-ownership test (§10) also scans migrations to enforce this.
- Existing migrations `001`–`043` are history. They stay as they are and are exempt.
- A data migration that spans modules is either split per owner, or declared `owner: 'platform'` with a written reason in the migration (a deliberate exception, like a workflow).
- There's one global migration sequence. Per-module sequences only become necessary once a module moves to its own database.
- Table-name prefixes (`tm_tasks`, …) were considered and rejected. They give the same enforcement as the ownership map, at the cost of renaming every SQL string, fixture and test helper.

### 5.5 Extraction readiness

A module is ready to extract to its own deployment when the blockers below have been dealt with. Ranked hardest first:

| # | Blocker | At extraction time | How we keep it visible |
|---|---|---|---|
| 1 | Taking part in a cross-module unit of work (workflows, same-transaction policies) | Becomes a saga or outbox with compensating steps: a redesign | Every workflow and same-transaction policy is listed (§3.2, §6.3) |
| 2 | Synchronous queries to other modules | Port adapters become HTTP clients or event-fed read models | Every such dependency is a consumer-owned port adapted in the composition root (§4.4) |
| 3 | Shared migration sequence | Owned migrations move to the module's own sequence | `owner` on every new migration (§5.4) |
| 4 | Foreign keys to identity anchors | Drop the constraint, keep the column as an opaque id checked through access | Allowed only for `organizations.id` and `users.id` (§5.1) |
| 5 | Other cross-module foreign keys or cascades | Not allowed | Forbidden (§5.1) |

Processing is a workflow, not a module, so this table doesn't apply to it. Today, every module is affected by some of blockers 2–4. Captures and Task Management are additionally affected by blocker 1, because of the processing workflow and the delete-source-capture policy.

## 6. Atomic changes across modules

### 6.1 Unit of work

```ts
// kernel
type Step        = { readonly owner: ModuleName; readonly plan: unknown };   // plan is opaque to everyone but its owner
type StepFailure = { kind: 'Conflict' | 'Storage'; owner: ModuleName; reason: string };
type Work<T, E extends IntegrationEvent = IntegrationEvent> =
  { readonly result: T; readonly events: readonly E[]; readonly step: Step };
type UnitOfWork = { commit(works: readonly Work<unknown>[]): ResultAsync<void, StepFailure> };

// persistence participants, one per module, registered with the unit of work by the composition root
type SqlParticipant<P>  = { owner: ModuleName; compile: (plan: P) => readonly GuardedStatement[] };
type FakeParticipant<P> = { owner: ModuleName; apply: (plan: P) => Result<void, StepFailure>;
                            snapshot: () => () => void /* returns restore */ };
```

- A `Step` carries the module's **plan as data**. Only the owning module's participant understands it.
- Each module provides an `SqlParticipant` in `infrastructure/persistence/` and a `FakeParticipant` in `infrastructure/fakes/`.
- Compiling a plan is pure, so a module can unit-test its plan-to-SQL output without a database.
- History's event sink is a participant too. Its prepare phase maps integration events to timeline records, and its compile phase turns those into `change_log` inserts (§7.2).

**Chosen implementation (U1): `client.transaction('write')`.** Parent accepted this at 2026-11-06 8:37 CT, after review of `0fd9fb8` confirmed the §12 trigger: the Turso batch error did not identify the failing statement. The Turso U1 run at 8:48 CT is recorded below. This is the fallback already written in §12. It adds no failure kind and no product behavior.

- The unit of work awaits each statement on `client.transaction('write')`. It does not call `db.execute` with a transaction-control statement. In `@libsql/client` 0.15.15, mode `write` is the library's own immediate transaction (`transactionModeToBegin`).
- No reads inside the transaction, including no `PRAGMA` query. Setup and snapshots stay outside. Steps stay short.
- The pinned client does not take a timeout. `Config` and `transaction(mode)` have no timeout field, and `@libsql/hrana-client` 0.7.0 exposes none. The runner passes `transaction('write')` and `{ url, authToken }` only. The words "5-second lock timeout" occurred only in the earlier fallback sentence of this section. They are not a configured value. This record does not claim that timeout and does not hold a transaction open to probe one.
- `StepFailure` stays `{ kind: 'Conflict' | 'Storage'; owner: ModuleName; reason: string }`.
- The owner is the awaited step's `ModuleName`. Each call is that step, so the compiler knows the owner. It is not read from `code`, `rawCode`, or `index`.
- A guarded write whose `rowsAffected` is `0` is `kind: 'Conflict'` and `reason: 'guard-miss'`.
- An ordinary `execute` that throws is `kind: 'Storage'` and `reason: 'execute-failed'`, with the owner of that step.
- Neither path parses a SQL message or fills in a missing `rawCode` or `index`.
- The guard `CHECK` remains a probe. Its thrown error is recorded next to a primary-key error. It corroborates that the assertion statement failed. It is not the classification input. On Turso the check and the primary key reported the same allowlisted fields, and the mapping did not use them.
- The runner is `docs/architecture/adr/spikes/remote-runner-u1/`. It was executed once. `u1_tasks` now exists, so it must not be run again. Production code is unchanged. This record is on main as `0d2a87077dce8dbdd0bbf0546607adb01ed9ca29` ([#312](https://github.com/jmhill/yoink/pull/312)).

**Recorded alternative (U2), not chosen.** One batch with guards owned by each module.
- The SQLite unit of work collects statements in three steps:
  1. it asks each step owner's `SqlParticipant` to compile its plan
  2. it adds the event sink's statements for every integration event
  3. it adds statements compiled from the work of same-transaction policies (§6.3)

  It then runs everything in **one `db.batch(..., 'write')`**.
- Guards are the module's own conditional writes (e.g. `UPDATE captures … WHERE status = 'inbox'`). Each is immediately followed by a platform-provided assertion that makes the batch fail when the guarded write changed no rows. For example, a statement that inserts `changes() > 0` into a guard table owned by platform, with `CHECK (ok = 1)`.
- **Statement order doesn't matter for atomicity.** Any failed guard aborts the whole batch. The only ordering rule is that each assertion comes straight after its own guarded write, and participants handle that themselves.
- If the batch fails, the unit of work classifies a typed `Conflict` or `Storage` failure from the client error. The local spike below found no statement index on that error, so `StepFailure.owner` cannot be filled from it.
- All reads and decisions happen **before** the batch runs, including reads by policies. A batch contains only guarded writes.
- **No module's SQL references another module's table.** The current `EXISTS (SELECT … FROM <other table>)` guards, including history's `existsClause`, are removed. Inside one batch, the owning module's step guarantees the subject exists.

**Local spike, 2026-11-06. U2 is not confirmed.** The remote half is the next section. U1 is the chosen implementation above and has its own local file run further down. Production `createDatabase` was not changed. The runner is `docs/architecture/adr/spikes/m0-2-u2-batch.ts`. The captured local output is `docs/architecture/adr/spikes/m0-2-u2-batch.local.json`.

The run used `createDatabase({ type: 'file' })` on a temporary file, Node v24.22.2, and the pinned `@libsql/client` 0.15.15. `PRAGMA foreign_keys` read back `1`. The client maps `db.batch(..., 'write')` to `BEGIN IMMEDIATE` (`@libsql/core` `transactionModeToBegin`). The temporary file was deleted after the run.

Guard table, owned by the spike the way platform will own it:

```sql
CREATE TABLE platform_batch_guard (
  ok INTEGER NOT NULL CHECK (ok = 1)
);
```

Assertion, placed immediately after each guarded write:

```sql
INSERT INTO platform_batch_guard (ok) VALUES (changes() > 0);
```

The guarded writes used the current statement shapes. The task write is `updateTaskQuery` (`tasks/infrastructure/task-row-statements.ts`): `UPDATE tasks SET` title, due date, completed at, pinned at, assignee, list, project, open order, and the three last-changed columns `WHERE id = ? AND organization_id = ? AND deleted_at IS NULL`. The capture write is `markCaptureProcessedIfInboxQuery` (`processing/infrastructure/process-row-statements.ts`): `UPDATE captures SET status = 'processed', processed_at = ?, processed_to_type = ?, processed_to_id = ? WHERE id = ? AND organization_id = ? AND status = 'inbox' AND deleted_at IS NULL`. The history write is `insertChangeLogQuery` for a task (`shared/change-log/infrastructure/sql.ts`): `INSERT INTO change_log (...) SELECT ... COALESCE((SELECT MAX(seq) FROM change_log), 0) + 1 WHERE EXISTS (SELECT 1 FROM tasks WHERE id = ? AND organization_id = ? AND deleted_at IS NULL)`. The throwaway tables had those columns and the current `change_log` checks, including `UNIQUE` on `seq`. They were not the production schema.

`changes()` inside the same batch saw the previous write. After a matching `UPDATE`, `SELECT changes()` returned `1` (`rowsAffected` `[1, 0]`). After an `UPDATE` whose id was missing, it returned `0` (`rowsAffected` `[0, 0]`). A later 0-row `UPDATE` still made the assertion fail when an earlier statement in that batch had changed a row. `changes()` did not stay stuck at the earlier write.

Commit when both guards match. One batch: capture update, assertion, task update, assertion, history insert. 5 statements, 0.7 ms, every `rowsAffected` was 1. Afterwards the capture was `processed`, the task title was `after`, `change_log` had 1 row, and `platform_batch_guard` had 2 rows whose `ok` values were 1.

Stale capture guard rolls the whole batch back, including history and the earlier task write. Before the batch the capture was already `processed`. The batch was: matching task update, assertion, history insert, `markCaptureProcessedIfInboxQuery` (0 rows), assertion, another history insert. It threw. Afterwards the task title was still `before`, `change_log` was empty, and the guard table was empty. The capture stayed `processed`, which is the pre-batch row, not a write from the batch.

Stale task guard rolls back the other participant. Before the batch the task's `deleted_at` was set, so `updateTaskQuery` matches 0 rows and the history `EXISTS` also matches 0 rows. The batch was: matching capture update, assertion, history insert, task update, assertion. It threw. Afterwards the capture was still `inbox`, so the capture update did not commit. `deleted_at` was unchanged. History and the guard table were empty.

Both failures threw `LibsqlError`. The guard failure was `code: "SQLITE_CONSTRAINT_CHECK"`, `rawCode: 275`, `message: "SQLITE_CONSTRAINT_CHECK: CHECK constraint failed: ok = 1"`. The cause was `SqliteError` with `message: "CHECK constraint failed: ok = 1"`. A duplicate task primary key in the same batch, after a matching task update, assertion, and history insert, threw `code: "SQLITE_CONSTRAINT_PRIMARYKEY"`, `rawCode: 1555`, `message: "SQLITE_CONSTRAINT_PRIMARYKEY: UNIQUE constraint failed: tasks.id"`, and the task title and history were unchanged. Own properties on both errors were `stack`, `message`, `cause`, `code`, `rawCode`, and `name`. There is no statement index. `StepFailure.owner` cannot be recovered from this client.

Error mapping from that output:

- `code === "SQLITE_CONSTRAINT_CHECK"` and the message contains `CHECK constraint failed: ok = 1` → `kind: "Conflict"`, `reason` is the message.
- Any other `LibsqlError` from the batch → `kind: "Storage"`, `reason` is the message.
- `owner` stays unknown until a client reports the failing statement index.

Large batch, same task update and history insert, `seq` computed as `MAX(seq) + 1`. 1,000 updates plus 1,000 history inserts (2,000 statements) committed in 73.8 ms. 1,000 tasks were retitled, 1,000 history rows were inserted, and `seq` was 1 through 1,000 with 1,000 distinct values. The U2-shaped batch, 1,000 updates plus 1,000 assertions plus 1,000 history inserts (3,000 statements), committed in 83.6 ms. 1,000 tasks were retitled, the guard table had 1,000 rows, and history `seq` was again 1 through 1,000. No batch limit was hit.

Two local caveats stay in force. Each successful assertion inserts a `platform_batch_guard` row, and the spike does not delete those rows except when a later scenario resets the table, so the table accumulates. `changes()` is connection state: the local file run found that a later 0-row update still failed its own assertion when an earlier statement in that batch had changed a row, and `changes()` did not stay stuck on the earlier write. The remote run did not add a separate mid-batch `changes()` probe.

**Remote spike, 2026-11-06 8:28 CT. U2 is not confirmed.** The parent ran the committed runner once on the box that holds the token. Exit 0, about 5.6 seconds, stderr empty. Node v22.23.2, `@libsql/client` 0.15.15, `npm ci` with `--ignore-scripts`, token left unset in the cloud environment. Host `libsql://yoink-m02-spike-jmhill.aws-us-east-1.turso.io`. Bundle sha256 `c3bdf00e2556343d1b5fd70b279d02179e237070109dc052be21b252db92f813`, built from commit `1435cffa7996df62a42b201d6a2fd0e76a50e6f5` on base `9e6b2ad32155c7085b10ef43161cbde47dda9ec5`. The five source hashes in the report are the hashes of that commit. The sanitized report is `docs/architecture/adr/spikes/m0-2-u2-batch.remote.json`. `jhtc-yoink` was not queried. The database was not deleted. The tables and the last committed rows were left in place. `CREATE TABLE` will fail if the runner is pointed at that database again, so it must not be rerun.

The report field `database.groupId` stores the database id `01a1b366-ad01-751d-bbab-7852a143f84b`, not a Turso group id. `database.temporary: false` means the database is not a temporary file. It does not mean the database is production. Later runner builds label that id `databaseId`. The stored report is unchanged.

`PRAGMA foreign_keys` read back `1`. `changes()` was `1` after a matching update and `0` after a missing update. The matching guard batch was 5 statements, 115.9 ms: task title `after`, capture `processed`, 1 history row, 2 guard rows whose `ok` values were 1. The stale capture guard was 6 statements, 94.7 ms, and rolled back: task title `before`, history 0, guards 0. The capture stayed `processed` because the setup statement before the batch had already committed it. The stale task guard was 5 statements, 98.4 ms: capture stayed `inbox`, history 0. The duplicate primary key was 4 statements, 110.3 ms, and rolled back to task title `before` and history 0. The 2,000-statement batch (1,000 updates + 1,000 history inserts) committed in 494.3 ms: 1,000 retitled tasks, 1,000 history rows, `seq` 1 through 1,000. The 3,000-statement batch (1,000 updates + 1,000 assertions + 1,000 history inserts) committed in 728.9 ms with those same counts plus 1,000 guard rows. Those are the sizes that were run. No maximum batch size was observed, and the timings are one sample, not a performance guarantee.

Every failed batch reported the same allowlisted error, on the error and on its cause: `code` `SQLITE_CONSTRAINT`, `rawCode` null, `index` null. The guard failure and the duplicate-key failure are not distinguishable from those fields. They do not identify the failing statement, the step owner, or the failure kind. The local map (`SQLITE_CONSTRAINT_CHECK` to Conflict, any other code to Storage) does not describe this Turso result. `StepFailure.owner` stays unknown.

M0.2's statement-index check failed. Atomicity of the tested batches and the tested sizes succeeded. That is not confirmation of U2. The index requirement is not waived.

The batch error mapping stays the measurement of U2: one `SQLITE_CONSTRAINT` with null `rawCode` and null `index` covered both the guard check and a duplicate primary key. Those fields do not classify Conflict versus Storage and do not name an owner.

**U1 local file run, 2026-11-06. Not the Turso proof.** The runner is `docs/architecture/adr/spikes/m0-2-u1-transaction-proof.ts`, checked by `m0-2-u1-remote-check.ts`. It uses `client.transaction('write')` on a temporary file and `@libsql/client` 0.15.15. Tables are prefixed `u1_`. The run is once-only: a second call sees `u1_tasks` and writes nothing. It does not drop tables. Setup `PRAGMA` and the later snapshots are outside the transaction. No step inside a transaction is a read.

A matching transaction committed: capture `processed`, task title `after`, one history row, and `rowsAffected` 1 on each awaited write. A stale capture guard stopped when that update's `rowsAffected` was 0, called `rollback` and `close`, and did not call `commit`. The task title stayed `before` and history stayed 0. The capture stayed `processed` because that status was committed before the transaction. The mapped failure was `{ kind: 'Conflict', owner: 'captures', reason: 'guard-miss' }` from `rowsAffected`, with no driver error. A following history insert in that same transaction was not executed.

The check probe ran the same writes and then `INSERT INTO u1_platform_batch_guard (ok) VALUES (changes() > 0)`. That statement threw. The transaction rolled back to the same snapshot. The probe's mapped failure is null: the thrown check is not classified. A duplicate primary key threw, rolled back to task title `before` and history 0, and mapped `{ kind: 'Storage', owner: 'task-management', reason: 'execute-failed' }`. On this file the check error was `code` `SQLITE_CONSTRAINT_CHECK`, `rawCode` 275, `index` null, and the primary-key error was `code` `SQLITE_CONSTRAINT_PRIMARYKEY`, `rawCode` 1555, `index` null. Those fields were recorded and `usedForClassification` is false. The Turso U2 run collapsed both to `SQLITE_CONSTRAINT` with null `rawCode` and null `index`, so this local difference is not a claim about Turso. The remote U1 run still has to record the actual `rowsAffected`, the rollback, and the check and primary-key `code` / `rawCode` / `index`.

The removed `withTransaction` helper (`4e7afab`, `d1e3625`) issued its transaction start through `db.execute()`, which cannot work over HTTP. U1 does not do that.

**Remote spike, 2026-11-06 8:48 CT. U1 ran once.** The parent ran the committed runner on the box that holds the token. Exit 0, about 7.5 seconds, stderr empty. The report's `durations.processMs` is 7366.9. Node v22.23.2, `@libsql/client` 0.15.15, `npm ci` with `--ignore-scripts`, token left unset in the cloud environment. Host `libsql://yoink-m02-spike-jmhill.aws-us-east-1.turso.io`. Bundle sha256 `f8c8aef03221fc2a5298157808badc08c2abe260ec6d9e9238eae542c74a47e4`, built from commit `9e782fb56a09949628d55f57f99b528de50eb7c9`. The sanitized report is `docs/architecture/adr/spikes/m0-2-u1-transaction.remote.json`. Its sha256 is `4944aa9a6c677e0ad1db7beca21b06470938a14e19845953bc554d9195de19b1`. The four source hashes in that report are the hashes of that commit. `jhtc-yoink` was not queried. The database was not deleted. The U2 tables were not changed. The `u1_` tables and the last committed rows were left in place. Do not run the runner again.

`readsInsideTransaction` is false. `manualBegin` is false. Every scenario has `closeCalled` true. `timeout.configuredMs` is null and `setByRunner` is false. The longest transaction was the check probe at 481.5 ms. The process duration of 7366.9 ms is longer than five seconds. No timeout was configured, so that duration is not a 5-second lock result and it is not a guarantee.

`foreignKeys` is null. That is a reporter bug, not a measurement that foreign keys are off. The reader takes column `value`. The snapshot queries alias that name. `PRAGMA foreign_keys` returns column `foreign_keys`, so the reader stored null. The stored report is unchanged. No scenario depends on a foreign-key failure. The U2 report's foreign-keys value of 1 was a different connection and does not prove this one. A second remote probe was not run. M4.1 tests foreign-key enforcement explicitly. This gap does not leave M0.2 open.

Matching commit, 406.2 ms. Capture update, task update, and history insert each reported `rowsAffected` 1. The transaction committed. Afterwards the task title was `after`, the capture was `processed`, and history count was 1. Guard count was 0 because this path does not insert the probe row.

Stale capture guard, 378.9 ms. Task update `rowsAffected` 1, history insert `rowsAffected` 1, capture update `rowsAffected` 0. The runner stopped there and did not execute the later history insert. `commitCalled` is false, `rollbackCalled` is true, `driverError` is null. The mapped failure is `{ kind: "Conflict", owner: "captures", reason: "guard-miss", source: "rowsAffected" }`. Afterwards the task title was `before` and history count was 0. The capture stayed `processed` because that status was committed in setup before the transaction.

Check probe, 481.5 ms. The same three writes ran, the capture update again affected 0 rows, and `INSERT INTO u1_platform_batch_guard (ok) VALUES (changes() > 0)` threw. The following history insert did not run. Rollback left the task `before`, history 0, and guard count 0. `mapped` is null. The driver error, and its cause, are `code` `SQLITE_CONSTRAINT`, `rawCode` null, `index` null.

Duplicate primary key, 458.1 ms. Task update and history insert affected 1 row each, then the duplicate insert threw. Rollback left the task `before`, the capture `inbox`, and history 0. The mapped failure is `{ kind: "Storage", owner: "task-management", reason: "execute-failed", source: "thrown-execute" }`. The driver error matches the check probe: `SQLITE_CONSTRAINT`, `rawCode` null, `index` null. `allowlistedFieldsEqual` is true and `usedForClassification` is false. The kind and the owner come from the awaited step and, for Conflict, from `rowsAffected`.

| Criterion | Turso result |
|---|---|
| Matching commit | Met. 406.2 ms. `rowsAffected` 1, 1, 1. Task `after`, capture `processed`, history 1. |
| Stale-guard rollback | Met. 378.9 ms. Stopped at capture `rowsAffected` 0, before the later history insert. No commit. Task `before`, history 0. Conflict owner `captures`. |
| Primary-key rollback | Met. 458.1 ms. Thrown duplicate insert. Task `before`, capture `inbox`, history 0. Storage owner `task-management`. |
| Check probe | Met as corroboration only. 481.5 ms. Thrown, rolled back, guard count 0, `mapped` null. |
| Driver `code` / `rawCode` / `index` | Recorded. Both failures are `SQLITE_CONSTRAINT`, null, null. Not used to classify. |
| Reads inside the transaction, manual transaction start | Both false. |
| Close after commit and after rollback | `closeCalled` true on every scenario. |
| Timeout | `configuredMs` null. Not claimed. Longest transaction 481.5 ms. Process 7366.9 ms. |
| Foreign keys | Inconclusive. Stored `foreignKeys` is null because the reader asked for column `value`. |
| Statement index | Null, as on the U2 run. U1 does not need it. The owner is the awaited step. |

M0.2 is done on main (`0d2a87077dce8dbdd0bbf0546607adb01ed9ca29`, [#312](https://github.com/jmhill/yoink/pull/312)). The findings are this section. Production code is unchanged. No production unit of work is added by this record.

**In-memory unit of work** (tests). On commit, it snapshots every registered `FakeParticipant` and applies each step's plan, plus the event sink and the policies' work. On any failure it restores every participant. This replaces the hand-written snapshot and restore code in today's fake persist adapters.

### 6.2 Workflows (orchestration)

Use a workflow when **one user or caller intent changes state in more than one module and must be atomic.** A workflow is a deliberate exception that crosses a lifecycle boundary, not the default way to build a complex command.

```ts
// workflows/processing/application/handle-process-to-task.ts
export const handleProcessToTask = (cmd: ProcessToTask, deps: ProcessingDeps) =>
  deps.captures.queries
    .findInboxCapture(cmd.captureId, cmd.organizationId)
    .andThen((capture) =>
      // Work 1: Task Management prepares the task from a document (TaskStarter)
      deps.taskManagement.prepare
        .createTask(toTaskStarter(cmd, capture), cmd.actor)   // toTaskStarter: pure Clarify rule (domain/)
        .andThen((taskWork) =>
          // Work 2: captures prepares its claim. Its guard fails if the capture has already left the inbox
          deps.captures.prepare
            .markProcessed({
              captureId: capture.id,
              organizationId: cmd.organizationId,
              to: { kind: 'task', id: taskWork.result.id },
            })
            .map((claimWork) => ({ taskWork, claimWork }))))
    .andThen(({ taskWork, claimWork }) =>
      deps.uow.commit([claimWork, taskWork]).map(() => taskWork.result));
```

- Workflows exchange **documents** with modules (e.g. `TaskStarter`), never plans, rows or internals ("tell, don't ask").
- Errors move along the railway as typed `Result`s: each module's refusals, plus `StepFailure`.

### 6.3 Policies (choreography)

Use a policy when **an invariant must hold whichever edge triggered the change.**

```ts
type Policy<E extends IntegrationEvent> = {
  on: E['type'];
  react: (event: E) => ResultAsync<Work<unknown> | null, PolicyRefusal>;
};
```

- **Same-transaction policies** are registered with the unit of work as an explicit list in the composition root. During `commit`, the unit of work calls the policies that match the events produced, then adds their `Work` to the same batch.
  - Policies run after the caller has handed its work to `commit`, but **before the batch runs**. A policy's `react` may therefore read (for example, to prepare a deletion), and the time-of-check/time-of-use rule from §5.2 applies.
  - **One level only:** events from a policy's own work don't trigger further policies. Longer chains must become workflows.
  - A policy refusal aborts the whole commit, and the caller receives it as a typed error.
- **Eventual policies** react after commit through an outbox. **Deferred** until first needed, which will likely be together with event-fed read models.
- **Where a policy lives:**
  - In **the module whose state it changes, if that module is downstream of the publisher** in the §5.3 graph. The module declares the event shape it reacts to (§4.4), and the composition root wires it to the publisher's integration event.
  - Otherwise, in **the workflow that owns that lifecycle link**. Delete-source-capture changes captures, which is upstream of Task Management, so it lives in `workflows/processing/policies/`.

Current inventory:

| Policy | Trigger | Effect | Lives in | Flavour |
|---|---|---|---|---|
| Delete source capture | `TaskDeleted` with source capture | captures soft-deletes the capture | `workflows/processing/policies/` | same-transaction |

### 6.4 How current operations are classified

Re-checked against the codebase on 2026-11-06. Of all current operations, only processing capture → task and capture → project are workflows, and only "delete source capture" is a policy. Everything else is a single-module command, and some of those query other modules first:

- Every task, project and list operation is internal to Task Management. That includes next-action clearing, closing a project with its open tasks, confirming proposals, imports, reordering, and refusing to delete a list that still has open tasks.
- Assigning a task queries access.
- Note create, edit and import query Task Management (and access, for the mirror bot).
- The designated mirror bot moves into a table owned by notes, which removes the only write notes makes into access's tables.
- Signup, invitations, workspaces and ownership transfer are internal to access.

## 7. Events

### 7.1 Domain events vs. integration events

- **Domain events** are a module's internal facts: `decide-*` outputs and `apply` inputs. They're private and can change freely.
- **Integration events** are a module's published contract.
  - They're mapped from domain events in `application/integration-events/`.
  - They're versioned (`schemaVersion`) and carry everything their consumers need (e.g. `projectName`), so consumers never query back to interpret an event.
  - Policies, history and future read models consume **only** integration events.
- A module publishes an integration event only for a fact that another module (including history) consumes. Purely internal domain events stay internal.
- Integration events travel in each `Work`'s `events` list. They're recorded in `change_log` in the same batch as the change they describe. That gives later eventual consumers (§5.2, §6.3) an outbox to read from, without a separate mechanism.

**Envelope** (defined in `kernel/`):

```ts
type IntegrationEvent<T extends string = string, P = unknown> = {
  readonly id: string;              // unique per event
  readonly type: T;                 // e.g. 'TaskCompleted'
  readonly schemaVersion: number;
  readonly organizationId: string;
  readonly occurredAt: string;
  readonly actor: Actor;
  readonly subject: { type: string; id: string; projectId?: string };
  readonly payload: P;
};
```

**Evolving event schemas.** Within a `schemaVersion`, payload changes are additive only. A breaking change gets a new `schemaVersion`. Because `change_log` is permanent, history keeps a parser for **every version ever written**, as `parse-record.ts` already does.

### 7.2 History owns the change log

- History is the unit of work's **event sink**. It works in two phases:
  - **Prepare** runs before the batch, like policies. It maps each integration event to one or more timeline records and assigns record ids with the injected `IdGenerator`.
  - **Compile** is pure. It turns those records into `change_log` inserts for the same batch.
- The change-log record builders (`*/domain/change-log-records.ts`) move from the producing modules into history, which maps integration events to timeline records. Handlers no longer pre-generate change-log record ids.
- Timeline display rules move to history too: `HIDDEN_CHANGE_LOG_KINDS` (pin, unpin, reorder, renumber) and `countsTowardLastChanged`. Producing modules publish facts; history decides how they appear on the timeline.
- The existing `*PayloadV1` schemas become the starting point for integration event schemas.
- `change_log` currently does two jobs: the user-visible timeline and the event stream. That's accepted for now. Split it if the two start to conflict, for example over retention, visibility or volume.
- Gaps to close:
  - Captures emit no events today. Adding them means widening the `CHECK` constraint on `change_log.subject_type`, which requires rebuilding the table. That's a history-owned migration using the existing `table-rebuild` helper.
  - History from before migration `028` doesn't exist in the log.

  New entity types (Goal, Milestone) emit events from day one. Backfilling history for existing data is deferred until an event-fed read model needs it.

## 8. Edges

### 8.1 One edge per client

| Edge | Client | Auth | Change policy | Path prefix |
|---|---|---|---|---|
| `web` | main Yoink web app (PWA) | user session; legacy token fallback until PLAN 7.7c | expand/migrate/contract with a short window (§8.2) | `/web-api/` |
| `admin` | admin app | admin session | expand/migrate/contract with a shorter window (§8.2) | `/admin-api/` |
| `extension` | browser extension | API token | versioned like the public API (§9); installed versions update on the store's schedule | `/extension-api/v1/` |
| `public-api` | bots, agents, `tools/notes-mirror`, future MCP | API token | stable; versioned (§9) | `/api/v1/` |
| `ops` | infrastructure (Fly health checks) | none | stable; a documented exception inside `/api/`, not part of v1 and not versioned | `/api/health` (unchanged) |
| `test-fixtures` | acceptance and E2E tests | fixture-gated | test-only | `/test-api/` (moved from `/api/test/`) |

- **BFF edges own both reads and writes** for their client. Write responses are shaped for the screen (to support optimistic updates and post-mutation views).
- **Each edge mounts the one auth model its client uses.** The exception is the web edge, which keeps `combined-auth-middleware` (session plus legacy token) until PLAN 7.7c removes the token fallback. The middleware is retired then.
- A future **MCP edge** (`edges/mcp/`) will be another client. It uses token auth and calls the same module and workflow interfaces.
- **Session cookies** are set with `path: '/'` (`auth-routes.ts`, `admin-routes.ts`), so they already cover `/web-api/` and `/admin-api/`. Edges that use session cookies rely on `sameSite` for CSRF protection, and cookie settings must not narrow the path.
- **Rate limiting is configured per edge.** The shared policy (`rate-limit-policy.ts`) moves to `edges/_shared/` and each edge applies it with its own limits. For example, public API token limits can differ from web session limits.
- **Path prefixes:** `/web-api/`, `/admin-api/`, `/extension-api/` and `/test-api/`. Each is a single top-level segment, chosen because:
  - The admin SPA already owns `/admin` (static files, router `basepath`, not-found fallback). A BFF under `/admin/...` would take precedence over SPA deep links.
  - The web SPA owns every other path.
- **Every prefix must be registered in:**
  - the not-found and SPA fallback in `app.ts`
  - the PWA `navigateFallbackDenylist` in `apps/web/vite.config.ts`
  - the Vite dev proxies (`apps/web/vite.config.ts`, `apps/admin/vite.config.ts`)
  - rate-limit and logging configuration

### 8.2 Rules for edge code

**Changing BFF contracts.** The web app is a PWA registered with `registerType: 'prompt'` (`apps/web/vite.config.ts`). Users can keep running an old cached build until they accept the update, so the web edge doesn't change in lockstep with the server. Breaking changes to `/web-api/` therefore follow expand/migrate/contract:
1. Add the new shape alongside the old one.
2. Ship the frontend that uses it.
3. Remove the old shape once no requests carrying the previous build's id have arrived for a set number of days.

The web and admin apps send a build-id request header for this. Admin follows the same rule with a shorter window. The extension edge is versioned instead (§9).

- An edge handler calls **at most one command or workflow**, and any number of queries. If a screen needs two changes to succeed together, that's a workflow in the core.
- Edges **compose, filter and shape**:
  - screen composition (e.g. Now = next actions + loose dated tasks; header counts; owner labels; display ordering)
  - mapping module documents to contract types
  - mapping errors to HTTP
- Edges contain **no business rules, no SQL, and no state.**
- Pagination across modules: page through one module's query, then enrich the page with batched lookups by id from the others. A view that needs more than that is a sign the owning module should publish a query for it, or that the view needs its own state, which would make it a module.
- What `edges/_shared/` contains is listed in §3.4.

### 8.3 Contracts

```
packages/api-contracts/src/
  web/          # web BFF contract
  admin/
  extension/
    v1/
  public-api/
    v1/
  ops/
  schemas/      # documents genuinely shared by two or more edges (sharing allowed, never required)
```

Each frontend imports only its own edge's contract. Today's `packages/api-contracts/src/orpc/` contracts become legacy. Each one is removed once every route it describes has moved to an edge contract.

### 8.4 Design principles for the public API

These principles apply in full from **v2** onward, and to anything newly **added** to v1. v1 is today's integration surface, frozen (§9), so its existing shapes don't change.

- **Intent-shaped, not entity CRUD.** Commands are named by intent, and queries are named by the question they answer, reflecting the module interfaces. A design that reads well for humans also reads well for agents.
- **Self-describing.** Every procedure and field has a description in the contract. These flow into OpenAPI, and later into MCP tool descriptions.
- **Safe to retry.** Prefer idempotency by design: create commands accept an id generated by the client, so a retry with the same id is a no-op. Where that isn't possible, an idempotency-key service owned by platform (with a platform-owned table, injected into edges through `edges/_shared/`) is introduced when the first real case needs it.
- **Bounded.** Paginated by default, with summary shapes where useful.
- **Actionable errors.** A stable machine-readable `code`, plus a message that says what to do next.

## 9. Public API versioning

- **Scheme:** a major version in the URL path (`/api/v1/...`). Within a major version, changes are additive only.
- **v1 is today's integration surface, frozen.** The contracts of today's integration routes are copied unchanged as v1 and served at both `/api/v1/` and the `/api/` alias. The copy does not alias the live legacy Zod objects. `packages/api-contracts/src/public-api/v1/frozen-shape.json` pins the copied shape. Structural sharing below is how a later major version is built from v1. It is not permission for v1 to keep pointing at a schema that can still change.
  - Within v1, only additive changes are allowed: descriptions, new error codes, optional client-generated ids for idempotency, and new procedures.
  - The intent-shaped redesign (§8.4) is **v2**. It's built using structural sharing, after Task Management and the edges exist.
- **A breaking change creates a new major version of the whole API through structural sharing.** It does not create per-endpoint versions.
  - Contracts: `publicApiV2 = { ...publicApiV1, tasks: { ...tasksV1, create: createTaskV2 } }`.
  - Server: `v2Router = { ...v1Routes, tasks: { ...v1Routes.tasks, create: createTaskV2Route } }`.
  - Both are mounted side by side.
  - Nothing falls back from one version to another at runtime. Each version is complete, and unchanged procedures share the same route code.
  - A spread copies each procedure, including its OpenAPI path. It does not rewrite that path. The paths inside the shared contract are the resource path after the mount prefix (`/tasks`, not `/api/v1/tasks`). The version is the prefix passed to `handle`, below.

**Measured on `@orpc/*` 2.0.0-beta.48 (M0.3).** The spike is `apps/api/spikes/m0-3/`. It is not imported by `app.ts`. Production contracts and routes are unchanged. Zod stays on 3. The explicit-list fallback was not needed: both spreads typecheck.

The contract under test has two procedures, `one` (POST) and `two` (GET). `v2` is `{ ...v1Contract, one: changed }`. The implemented v2 router is `{ ...v1Procedures, one: changedHandler }`. Contract paths are `/m03/one` and `/m03/two`. One Fastify instance registers six routes with `app.route({ method, url })`, the same shape as `orpc-capture-routes.ts`. Each handler calls `handler.handle(request, reply, { prefix, context })`. The prefix is `/api/v1`, `/api`, or `/api/v2`. oRPC strips that prefix and then matches the contract path. All six requests returned 200. The alias routes set `Deprecation`, `Sunset`, and `Link` in their own `onRequest`. `Link` targets the v1 URL of the same procedure, because the alias is v1. The v1 and v2 responses did not carry those headers. The dates in the spike are fixtures so the hook can be asserted. They are not a product sunset. The 90-day rule above is unchanged.

```ts
const v2Contract = oc.router({
  ...v1Contract,
  one: oc.meta(openapi({ method: 'POST', path: '/m03/one' })).input(oneInput).output(oneV2Output),
});
const v2Router = implement(v2Contract).router({
  ...v1Procedures,
  one: implement(v2Contract).one.handler(async ({ input }) => ({ version: 'v2', name: input.name, extra: 'changed' })),
});
```

Two mounts that look plausible do not serve this contract:

- A contract path that already contains `/api/v1` matches only that URL. Spreading it and replacing `one` with a `/api/v2` path leaves `two` at `/api/v1/m03/two`. The generated v2 document then contains `/api/v1/m03/two` and `/api/v2/m03/one`, and no `/api/v2/m03/two`. The alias URL `/api/m03/one` returns 404 when `handle` is called without a prefix.
- `app.register(plugin, { prefix: '/api/v1' })` without passing that prefix to `handle` also returns 404. Fastify's prefix is not the prefix oRPC strips.

`OpenAPIGenerator` emits the contract paths and operation ids. For this spike those paths are `/m03/one` and `/m03/two` on both the v1 and v2 documents. The HTTP prefix is not written into the spec. Requesting OpenAPI `3.1.0` emitted `3.1.0`. Response `content` is `{}`. The default converter does not convert Zod, and this repo does not depend on `@orpc/zod`. Request validation still uses the Zod contract. Publishing a spec whose schemas describe those contracts needs a converter this spike does not add. That choice is open. It does not change the mount.

**Contract inventory today.** `packages/api-contracts/src/orpc/index.ts` exports separate routers. There is no versioned router and no spread. Every procedure path is absolute and starts with `/api/`:

| Router | Paths |
|---|---|
| admin public, admin protected | `/api/admin/...` |
| auth | `/api/auth/login/options`, `/api/auth/login/verify`, `/api/auth/logout`, `/api/auth/session` |
| signup | `/api/auth/signup/options`, `/api/auth/signup/verify` |
| passkey | `/api/auth/passkey/...` |
| token | `/api/auth/tokens`, `/api/auth/tokens/{tokenId}` |
| capture, process-capture-to-project | `/api/captures/...` |
| health | `/api/health` |
| invitation | `/api/invitations/...`, `/api/organizations/{organizationId}/invitations` |
| list | `/api/lists/...`, `/api/unlisted/tasks`, `/api/unlisted/tasks/order` |
| note | `/api/projects/{projectId}/notes/...`, `/api/notes/changed`, `/api/notes/import` |
| organization | `/api/organizations/...` |
| project | `/api/projects/...` |
| review | `/api/review`, `/api/review/done` |
| task | `/api/tasks/...` |
| work | `/api/work/next-actions`, `/api/work/due`, `/api/work/lists` |

M3.1's frozen copy is `packages/api-contracts/src/public-api/v1/`. Each procedure path is the legacy path with `/api` removed, so `/api/captures` is stored as `/captures`. Its input and output schemas are detached copies, and `frozen-shape.json` pins that shape. M3.2 passes `/api/v1` and `/api` to `handle` (`apps/api/src/edges/public-api/v1/`, `apps/api/src/edges/_shared/orpc/dispatch.ts`). A copy that keeps `/api/captures` will not also match `/api/v1/captures`. Client-only routes stay out of that copy, as the alias rule below already says. `app.ts` calls `registerPublicApiV1`, so the 59 integration procedures are served at token-only `/api/v1` and at the `/api` alias. The alias sets `Link` to the v1 URL. `Deprecation` and `Sunset` stay unset until M7.1 records a real window of at least 90 days. That omission is the plan's unset option. It does not advertise a retirement date, and it does not start the 90-day clock. The frozen copy includes `GET /api/auth/tokens`. Token create and delete stay client-only, with no alias headers. Health is not on this router. M3.3 moves the client-only registrars (admin, auth, passkey, signup, invitation, organization, and token writes) to `apps/api/src/edges/legacy/` at the same paths and the same auth. They stay out of v1. M3.3 is not done until review and merge.
- **The extension edge** (`/extension-api/v1/`) uses the same scheme and deprecation mechanics. Usage is logged per extension version, which the extension sends in a request header.
- **Modules are unversioned.** Version differences exist only in an edge's mapping. A module changes only when a capability changes, and an older version's route maps onto the new command (with defaults where needed).
- **Deprecation:**
  - Individual procedures can be marked `deprecated` in OpenAPI.
  - A version is retired as a whole, after a minimum period:
    - **Public API:** 90 days from the `Deprecation` date to the `Sunset` date. This may be shortened explicitly for a specific version.
    - **Extension edge:** 90 days, or until no requests from the old version have arrived for 30 days, whichever is later.
  - The deprecated version's responses carry `Deprecation`, `Sunset` and `Link: <successor>; rel="successor-version"` headers.
  - Usage is logged per token and per extension version, so retirement is based on evidence.
  - **Usage logging lives in `platform/logging`.** Edges add the token id, the client build or version, and the API version to each request's log context through `edges/_shared/`. The data stays in logs, so no new table is needed.
- **Today's unversioned `/api/...` routes are sorted into two groups**, using a route inventory made in the migration:
  - **Integration routes** (usable with an API token, and used by bots, agents, tools or the extension) become a **deprecated alias of v1**.
  - **Client-only routes** are never aliased into v1. These are admin (`/api/admin/...`), plus session, passkey, signup and invitation flows used only by the web app. They stay as legacy routes until their client has moved to its edge (`/admin-api/`, `/web-api/`), and are then removed.
- **How the alias is implemented:** the same v1 router is mounted a second time at `/api/`, covering integration routes only. A hook adds the deprecation headers and logs alias usage per token.
  - `/api/health` and the client-only legacy routes keep their own registrations, so they can't conflict with the alias.
  - `v1` can never be used as a top-level resource name.
- **When the alias is removed:**
  - A sunset date is announced, using the public API's minimum period.
  - The alias is removed once **the sunset date has passed and the alias has seen no calls for 30 days**.
  - If a token is still calling the alias at the sunset date, its owner is contacted before removal.
  - Removal also requires that web, admin and the extension have moved to their edges.

## 10. Enforcement

All rules start at `warn`, with a baseline recorded in `docs/architecture/ESLINT_BASELINE.md`. Each rule moves to `error` once the phase that satisfies it is complete. The end state is all `error`, run by `pnpm quality` (the pre-commit hook) and CI.

**ESLint (`eslint-plugin-boundaries`, `no-restricted-imports`):**
1. Layer direction inside a module: domain → own domain, kernel; application → own domain and application, kernel; infrastructure → own module, kernel, platform.
2. **Modules never import other modules, workflows or edges** (§4.4).
3. Workflows and edges import modules only through `modules/<name>/index.ts` (the `boundaries/entry-point` rule). The runtime DAG from §5.3 is checked by review of the composition root, not by lint.
4. Workflows import modules' `index.ts` and kernel only. The `UnitOfWork` type is in the kernel, and the composition root injects platform's implementation. Workflows have no `infrastructure/`.
5. Edges import modules' and workflows' `index.ts`, kernel, `edges/_shared`, contracts, and platform (except `platform/database` and `platform/sql`). Never `infrastructure/`.
   - `kernel/` imports only `kernel/` (plus `neverthrow` and `zod`).
   - `platform/` imports only `kernel/` and `platform/`, never modules, workflows or edges. The SQLite unit of work receives participants by injection.
   - The wiring layer (`composition-root.ts`, `app.ts`, entry points, `src/tests/`) may import anything.
   - **Test entry point:** each module also has `modules/<name>/testing.ts`, which exports its fake-backed factory and fake participants for workflow and edge tests. Only `*.test.ts` files and `src/tests/` may import a `testing.ts`.
6. npm packages allowed per layer:
   - domain: `neverthrow`, `zod`
   - application: the same, plus kernel port types
   - Fastify, oRPC, libsql, Sentry, SimpleWebAuthn and `node:*` in infrastructure, platform and edges only
   - `@yoink/api-contracts` in edges only (transitional `warn` in modules, §4.1)
7. Every module, workflow and edge directory is registered as a boundaries element, so `no-unknown` stays at 0.

The first enforcement task refreshes `ESLINT_BASELINE.md`, which still says 15 warnings against today's 112. The rule names (`element-types`, `entry-point`, `external`) must be checked against `eslint-plugin-boundaries` v5's API when the rules are set up.

**Architecture test (Vitest), table ownership:**
- A map from each table to its owning module lives in `platform/`.
- The test scans non-test files for SQL that references a table. It fails if:
  - a module's files reference a table they don't own
  - any SQL appears in workflows or edges (except `edges/test-fixtures/`)
  - a new migration (after `043`) has no `owner`, or touches a table its owner doesn't own (unless it's `owner: 'platform'` with a written reason)
  - a new foreign key references another module's table, other than the identity anchors
  - a `workflows/*/infrastructure/` directory exists
- The test is **heuristic**: it finds SQL by matching keywords (`FROM`, `JOIN`, `INTO`, `UPDATE`, `TABLE`, `REFERENCES`) followed by a table name inside string literals. A false positive is fixed by restructuring the code or by an explicit, commented allowlist entry, never by loosening the rule.

## 11. Legacy code being migrated

- **Store-object ports and `*-service` modules** (access, the old task service, processing) move to the functional pattern: application-owned function ports, decide → plan → persist, and commands that prepare then commit. The migration plan includes tasks for **every** remaining older service.
- **Contract types inside modules:** 81 domain files import `@yoink/api-contracts`, and `lists/domain` and `projects/domain` import `shared/request-validation`. These imports are removed as each module gets its own types (§4.1).
- **External dependency:** retiring `combined-auth-middleware` depends on PLAN 7.7c (removing the web app's legacy token fallback), which is outside this ADR's scope.
- **Test fixture routes** (`http-review-fixture-routes`, `http-ownerless-workspace-fixture-routes`) are moved to `edges/test-fixtures/` (`/test-api/`) and exempted. A dedicated task reviews **why they exist and how to remove them**, for example through setup via public commands, injected clocks, or seeding through the unit of work.

## 12. Risks and spikes

| Risk | Mitigation |
|---|---|
| U2's guard assertion (`changes()` within a libsql batch, plus a `CHECK` constraint) behaves differently locally and on Turso, batch errors don't identify the failing statement, or large batches are rejected | **Spike first** (local libsql + Turso), including one large batch (about 1,000 task updates plus their change-log records, matching `OPEN_TASKS_FETCH_LIMIT` when a project is marked done). Fall back to U1 with its rules. Local libsql on 2026-11-06 accepted the assertion, rolled back on a stale guard, and accepted a 3,000-statement batch (§6.1). The local error has no statement index. Turso on 2026-11-06 8:28 CT committed the same batches, including 2,000 and 3,000 statements, and rolled them back on a stale guard. Its error `code` was `SQLITE_CONSTRAINT` for both the guard and a duplicate primary key, with `rawCode` null and `index` null. U2 is not confirmed. U1 is the chosen implementation (§6.1), accepted 2026-11-06 8:37 CT as this fallback, not as a new failure model. Turso ran U1 once at 8:48 CT: commit, stale-guard rollback, and primary-key rollback held, and both thrown errors were `SQLITE_CONSTRAINT` with null `rawCode` and null `index`. Classification used the awaited step and `rowsAffected`, not those fields. `foreignKeys: null` in that report is a column-name bug and is inconclusive. M0.2 is done on main (`0d2a87077dce8dbdd0bbf0546607adb01ed9ca29`, [#312](https://github.com/jmhill/yoink/pull/312)) |
| Spreading oRPC routers or contracts for version sharing doesn't type-check | Measured on `2.0.0-beta.48` in `apps/api/spikes/m0-3/`. `{ ...v1, one: changed }` typechecks for the contract and for the implemented procedures. The explicit-list fallback was not used. A spread copies paths, so the version lives in the `handle` prefix (§9). M0.3 is done on main (`b30fe62241ef3335fc058d34f100f55b4a3672e1`, [#313](https://github.com/jmhill/yoink/pull/313)). Repeat this spike after an oRPC upgrade |
| Integration events lack fields consumers need | Consumer-driven: history's timeline mapping is the first consumer, and its tests define the required fields |
| Edges grow business rules | Lint (no SQL, entry points only), the one-command rule, and code review guidance in `apps/api/AGENTS.md` |
| The Task Management merge collides with the Goals and Milestones redesign | Merge structurally first, with no behaviour change. The hierarchy redesign then happens inside one module |
| oRPC is a beta (`2.0.0-beta.48`) and the edges and versioning design depend on it | Pin the exact version. Keep oRPC usage inside `edges/` and `edges/_shared/` so a breaking upgrade stays contained. Repeat the router-spread spike after each upgrade |
| Consumer-owned port shapes duplicate publisher types | The composition root's adapters type-check every port. The remaining duplication cost is recorded in ADR-002's lessons log |
| Migration breaks releasability | Expand/migrate/contract throughout: old routes and old adapters stay until every caller has moved, and every commit passes `pnpm quality` |

## 13. Deferred decisions

- Event-fed read models (checkpoints, backfill of history from before migration `028`)
- Eventual policies (outbox delivery after commit, retries, idempotent consumers)
- An idempotency-key service owned by platform (§8.4)
- Per-module migration sequences (§5.4)
- MCP edge design
- Splitting `change_log` into a timeline and an event stream
- Renaming the `@yoink/infrastructure` package
- Whether `planning` and `review` sessions need event-fed read models once built
- The Goals → Milestones → Projects → Tasks hierarchy, and whether lists remain a container (product decision, internal to Task Management)
- A module kit to reduce wiring boilerplate. See **ADR-002 (Deferred)**. Every migration task under this ADR records repeated boilerplate and wiring pain in ADR-002's lessons log. The final migration task reviews that log and decides whether to write ADR-002 in full.

## 14. Consequences

**Positive**
- Every module can change its storage and internals freely. The only coupling is its published interface and integration events.
- Atomic changes across modules without SQL that spans module tables, using the same Turso-safe primitive (`db.batch`) as today.
- Each client can change on its own terms; the public API gets real stability.
- The structure follows the product lifecycle (Capture → Clarify → Organize → Engage / Reflect), so new features (planning, review sessions, goals) have an obvious home.
- Enforced by tooling, not by convention.

**Negative**
- More code at the boundaries: mapping in edges, integration event mapping, and published query and prepare functions.
- Mapping duplicated across edges, and contracts duplicated per edge.
- Reads between modules can't use SQL joins. Some queries will need batched enrichment, or a query purpose-built by the owning module.
- Port shapes are duplicated across consuming modules.
- More URL prefixes to keep registered (the SPA fallback, the PWA denylist and the dev proxies, §8.1).
- Every breaking change to the web edge needs a PWA expand/contract window.
- A large, multi-phase migration.

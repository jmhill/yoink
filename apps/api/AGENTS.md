# API Server

Fastify API server implementing hexagonal architecture with multi-tenant token-based authentication.

## Architecture

**Target:** [ADR-001: Modules, workflows, and edges](../../docs/architecture/adr/001-modules-workflows-edges.md). The migration is in progress; see the [migration plan](../../docs/architecture/adr/001-migration-plan.md) and `docs/PLAN.md`. Read the ADR before structural changes. In short:

- `src/modules/<name>/`: bounded contexts that own state, organized by lifecycle (access, captures, task-management, notes, review, history). The only entry point is `index.ts` (plus `testing.ts` for tests). **Modules never import each other.** A module that needs another module's data declares a consumer-owned port, and the composition root adapts it.
- `src/workflows/<name>/`: orchestration across modules (processing). Owns no tables.
- `src/edges/<client>/`: all HTTP, one edge per client (`web`, `admin`, `extension`, `public-api/v1`, `ops`, `test-fixtures`). No SQL, no business rules. One command or workflow per handler. `src/edges/_shared/` holds the oRPC plumbing, request validation, rate-limit policy, listed-page HTTP mapping, and `server/` Fastify helpers (JSON body, trust proxy, static cache). Module infrastructure does not gain those helpers as a new privilege; today's route files already imported them.
- `src/kernel/` is pure shared code any layer may import: auth context, names, ISO dates, viewer-today, `ModuleName`, the `Clock`, `IdGenerator`, and `PasswordHasher` port types, the `HistoryReadLogger` port, `CommandLogger` and `withCommandLog`, and listing keyset primitives under `src/kernel/listing/`. Kernel imports only kernel, `neverthrow`, and `zod`. Real and fake clocks, id generators, and password hashers stay in `@yoink/infrastructure` and are imported from platform, the composition root, and tests. Listing HTTP mapping lives in `src/edges/_shared/`. `modules/history` holds the moved change log and timeline. `shared/` is gone. `src/platform/` holds config, the database and migrations, logging, the health checker (`SELECT 1`), and SQL helpers under `src/platform/sql/`. `src/kernel/unit-of-work.ts` and `src/kernel/integration-event.ts` hold the U1 types. `src/platform/unit-of-work/` has the SQLite and in-memory implementations. The composition root constructs history handlers and the sqlite change-log store from `src/modules/history/`. It registers one empty history sink on both the sqlite unit of work and the in-memory unit of work, using the same libsql write client as queries. `BootstrappedApp` exposes both. No route uses the unit of work yet. `app.ts` calls `registerPublicApiV1`. All 59 frozen integration procedures, including `GET /auth/tokens`, are served at token-only `/api/v1` and at the `/api` alias. The alias sets `Link` only. `Deprecation` and `Sunset` stay unset until M7.1. Token create and delete stay on `registerTokenMutationRoutes`, with no versioned path and no alias headers. A human token's actor has no token id, so the request log records a token id for bots only.
- **No storage dependencies between modules.** Every table has one owner. Atomic changes across modules go through the unit of work. Integration events go to history, which owns `change_log`.

While the migration is underway, new code follows the ADR wherever the surrounding module has already been migrated, and follows the existing local pattern otherwise. Don't add new cross-module table access or imports. The lint baseline and the table-ownership allowlist must not grow.

### Current layout (before migration)

Most modules still follow this structure:

```
{feature}/
  domain/           # Business logic (pure, testable)
    entity.ts       # Data types
    service.ts      # Business rules
    store.ts        # Port interface (what we need)
  infrastructure/   # Adapters
    sqlite-*.ts     # SQLite implementations
  application/      # HTTP layer
    routes.ts       # Fastify routes
```

`captures/` is a pilot of a different split (I/O sandwich). `lists/` follows the same shape for view + create + rename + delete + list-open-tasks + reorder (named list or the unlisted pile). Task create, PATCH, complete, and uncomplete are sandwiched the same way; pin/delete still use `TaskService`. See `docs/architecture/FUNCTIONAL_CORE.md`:

```
captures/  and  lists/  and  tasks/ create + PATCH + complete + uncomplete
  domain/           # Types + pure decide_* + apply
  application/      # Command/query handlers (the module’s public port)
  infrastructure/   # Persist + HTTP adapters
```

## Key Patterns

**oRPC OpenAPI**: Type-safe HTTP contracts shared between client and server. Legacy contracts live in `packages/api-contracts/src/orpc/` (`@orpc/openapi/fastify` on the API, `OpenAPILink` on clients). The frozen public v1 copy lives in `packages/api-contracts/src/public-api/v1/` and is mounted at `/api/v1` and the `/api` alias. Client-only routes live in `src/edges/legacy/` at the same paths and the same auth. They are not aliased into v1. `GET /api/health` is served from `src/edges/ops/`. Test fixtures are served from `src/edges/test-fixtures/` at `/test-api/`. Auth middleware lives in `src/edges/_shared/auth/`. Access production imports neither Fastify nor oRPC. `Deprecation` and `Sunset` stay unset until M7.1. M3.4 is done on main (`67e24d6b4e5d5f76db883679cf3cf6983ff4c598`). M3.5 is not done until review and merge. Zod schemas live in `packages/api-contracts/src/schemas/`. Domain code returns `Result`; only the HTTP adapter throws `ORPCError`.

**Token Format**: `tokenId:secret` for O(1) database lookups. The middleware parses the token, looks up by tokenId, then verifies the secret against a bcrypt hash.

**Fake Implementations**: Infrastructure utilities provide both real and fake implementations for testing:
- `createClock()` / `createFakeClock()`
- `createIdGenerator()` / `createFakeIdGenerator()`
- `createBcryptPasswordHasher()` / `createFakePasswordHasher()`

**Fastify Auth Context**: The auth middleware in `src/edges/_shared/auth/` attaches `request.authContext` with `organizationId` and `userId` for all authenticated requests. Combined auth still prefers the session cookie and falls back to a bearer token.

## Domain Model

```
Organization → User → ApiToken
                  ↓
              Capture (scoped to organization)
```

All capture queries are scoped to the authenticated user's organization.

## Running

```bash
pnpm dev    # Development mode with watch (from this directory)
pnpm start  # Production mode (from this directory)
```

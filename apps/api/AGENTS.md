# API Server

Fastify API server implementing hexagonal architecture with multi-tenant token-based authentication.

## Architecture

**Target:** [ADR-001: Modules, workflows, and edges](../../docs/architecture/adr/001-modules-workflows-edges.md). The migration is in progress; see the [migration plan](../../docs/architecture/adr/001-migration-plan.md) and `docs/PLAN.md`. Read the ADR before structural changes. In short:

- `src/modules/<name>/`: bounded contexts that own state, organized by lifecycle (access, captures, task-management, notes, review, history). The only entry point is `index.ts` (plus `testing.ts` for tests). **Modules never import each other.** A module that needs another module's data declares a consumer-owned port, and the composition root adapts it.
- `src/workflows/<name>/`: orchestration across modules (processing). Owns no tables.
- `src/edges/<client>/`: all HTTP, one edge per client (`web`, `admin`, `extension`, `public-api/v1`, `ops`, `test-fixtures`). No SQL, no business rules. One command or workflow per handler. `src/edges/_shared/` holds the oRPC plumbing, request validation, rate-limit policy, listed-page HTTP mapping, and `server/` Fastify helpers (JSON body, trust proxy, static cache). Module infrastructure does not gain those helpers as a new privilege; today's route files already imported them.
- `src/kernel/` is pure shared code any layer may import: auth context, names, ISO dates, viewer-today, `ModuleName`, the `Clock`, `IdGenerator`, and `PasswordHasher` port types, the `HistoryReadLogger` port, `CommandLogger` and `withCommandLog`, and listing keyset primitives under `src/kernel/listing/`. Kernel imports only kernel, `neverthrow`, and `zod`. Real and fake clocks, id generators, and password hashers stay in `@yoink/infrastructure` and are imported from platform, the composition root, and tests. Listing HTTP mapping lives in `src/edges/_shared/`. `modules/history` holds the moved change log and timeline. `shared/` is gone. `src/platform/` holds config, the database and migrations, logging, the health checker (`SELECT 1`), and SQL helpers under `src/platform/sql/`. `src/kernel/unit-of-work.ts` and `src/kernel/integration-event.ts` hold the U1 types. `src/platform/unit-of-work/` has the SQLite and in-memory implementations. The composition root constructs history handlers and the sqlite change-log store from `src/modules/history/`. It registers the history sink, with the capture timeline builders, on both the sqlite unit of work and the in-memory unit of work, using the same libsql write client as queries. Signup verify commits one access batch through the unit of work. Capture commands commit through that unit of work. Admin workspace, member, and admin-token writes are decide then an access plan (`access/application/handle-admin.ts`, `access/infrastructure/persistence/compile-admin.ts`). The composition root passes the sqlite `unitOfWork` into `createAdminService`, so those plans commit through `accessSqlParticipant`. Admin session login and verify decide, then `createAdminSessionParticipant` signs or opens the token (`access/application/handle-admin-session.ts`). SHA-256 and HMAC stay in `access/infrastructure/node-admin-session-crypto.ts`. The composition root builds that port and passes it, with the participant, to `createAdminSessionService`. `challenge.ts` is not used by this service. Agent mint takes the command and the membership and organization queries, decides, and commits one `mint-agent` plan (`access/application/handle-agent.ts`, `access/infrastructure/persistence/compile-agent.ts`). The composition root passes the sqlite `unitOfWork` into `createAgentService`. The notes mirror designation stays after that commit. Invitation create and revoke take the command and the organization and membership queries, decide, and commit one invitation plan (`access/application/handle-invitation.ts`, `access/infrastructure/persistence/compile-invitation.ts`). The composition root passes the sqlite `unitOfWork` into `createInvitationService`. Validate and the in-app pending list stay reads. Accept stays on `handleAcceptInvitation`. Invite-lock is unchanged. Add, leave, remove, and member role change take the command and the user, organization, and membership queries, decide, and commit one membership plan (`access/application/handle-membership.ts`, `access/infrastructure/persistence/compile-membership.ts`). The composition root passes the sqlite `unitOfWork` into `createMembershipService`. Get, list, and has-role stay reads. Leave guards stay in `decideRemoveMember` and run before that plan. Ownership transfer stays on `handleTransferOwnership`. Organization create takes the command, decides, and commits one organization plan (`access/application/handle-organization.ts`, `access/infrastructure/persistence/compile-organization.ts`). The composition root passes the sqlite `unitOfWork` into `createOrganizationService`. Get and list stay reads. The upsert sets only the name on conflict, so `notes_mirror_bot_user_id` and `time_zone` stay. Admin create and rename stay on `createAdminService`. Passkey registration verify, authentication verify, and credential delete take the command and the user or credential queries, decide, and commit one passkey plan (`access/application/handle-passkey.ts`, `access/infrastructure/persistence/compile-passkey.ts`). The composition root passes the sqlite `unitOfWork` into `createPasskeyService`. `@simplewebauthn/server` stays in `access/infrastructure/simplewebauthn-verifier.ts`. The service does not import config. `planRegistrationCredential` still verifies and does not write. Signup's batch is unchanged. List and option generation stay reads. Session create, refresh, revoke, organization switch, and expired-session cleanup decide, then commit one session plan (`access/application/handle-session.ts`, `access/infrastructure/persistence/compile-session.ts`). The composition root passes the sqlite `unitOfWork` into `createSessionService`. Validate stays a read. The edge still sets the cookie. The admin project timestamp still uses the project store. `BootstrappedApp` exposes both. `app.ts` calls `registerPublicApiV1`. All 59 frozen integration procedures, including `GET /auth/tokens`, are served at token-only `/api/v1` and at the `/api` alias. The alias sets `Link` only. `Deprecation` and `Sunset` stay unset until M7.1. Token create and delete stay on `registerTokenMutationRoutes`, with no versioned path and no alias headers. A human token's actor has no token id, so the request log records a token id for bots only. `app.ts` also calls `registerExtensionApiV1`. That edge is token auth only at `/extension-api/v1` and serves capture create and list. It logs `X-Yoink-Extension-Version`. The `/api` alias still serves older extension builds. The composition root does not change for this edge. `app.ts` also calls `registerWebApi`. That edge is the same combined auth as the `/api` alias, at `/web-api`, and serves Inbox list and create, tasks and lists, the project page and staged import, the Work screen, settings and organizations (members, invitations, tokens, ownership, leave, and organization switch), and auth (login, signup, session, logout, passkeys, and join validate/accept). Task, list, and open-task pages stay in Task Management order. The Work screen arranges the Now and due pages into sections and adds the query totals and owner labels. It does not re-sort those pages. Work lists stay in query order. Finished tasks, history, and notes stay on the `/api` alias. It logs `X-Yoink-Build`. Login verify and signup keep their rate-limit windows on this edge. When signup services exist, `app.ts` passes those existing handlers into `registerWebApi`. The composition root does not change for this edge. `GET /auth/tokens` stays on token-only `/api/v1` and the `/api` alias. Token create and delete stay on `registerTokenMutationRoutes` as well as this edge. Legacy auth, passkey, signup, and invitation routes stay. The other screens stay on the `/api` alias. `app.ts` calls `registerAdminRoutes` from `edges/admin/`. That edge is admin-session auth at `/admin-api` and at `/api/admin`. It logs `X-Yoink-Build` on `/admin-api`. The admin session cookie path stays `/`. Combined auth on the web edge is unchanged.- **No storage dependencies between modules.** Every table has one owner. Atomic changes across modules go through the unit of work. Integration events go to history, which owns `change_log`.

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

`modules/captures/` is the captures pilot. `index.ts` publishes `{ commands, queries, prepare }` and the capture document in `domain/model/capture.ts`. Domain and application do not import `@yoink/api-contracts`. Domain decisions and plans stay pure. The SQL participant and the fake participant live in infrastructure. The public-api edge maps that document onto the contract capture and maps the closed `Result`. `modules/task-management/` holds tasks, projects, lists, and the Now, due, and work-list queries. Those queries return already ordered, filtered, cursor-paginated pages. `now-order.ts` keeps the fake-store comparisons on the same keyset keys as the SQL. The public API work routes stay on `edges/public-api/v1/` and call those queries. The web tasks and lists edge calls the list and task handlers and returns those pages in query order. It does not sort, and it does not query Now, due, or work lists. The web project-page edge calls the project handlers and returns open-task pages in that query order. It does not sort. The web work edge calls the Now, due, and work-list queries. It arranges the Now and due pages into sections and adds counts and owner labels. It does not re-sort those pages. Work lists stay in query order. Finished tasks, history, and notes stay on `/api`. List view, create, rename, delete, list-open-tasks, and reorder (named list or the unlisted pile) still use the handler ports. Task create, PATCH, complete, and uncomplete do too; pin and delete still use `TaskService` until M5.4. `createTaskManagement` publishes `{ commands, queries, prepare }`, and those commands commit through the shared unit of work. See `docs/architecture/FUNCTIONAL_CORE.md`:

```
modules/captures/          commands, queries, prepare; unit of work writes the plan
modules/task-management/   commands, queries, prepare; unit of work writes tasks, projects, lists, and imports
  domain/                  model, messages, decisions, projections, rules
  application/             handlers and ports; index.ts publishes today's factories
  infrastructure/          persistence, rows, fakes
```

## Key Patterns

**oRPC OpenAPI**: Type-safe HTTP contracts shared between client and server. Legacy contracts live in `packages/api-contracts/src/orpc/` (`@orpc/openapi/fastify` on the API, `OpenAPILink` on clients). The frozen public v1 copy lives in `packages/api-contracts/src/public-api/v1/` and is mounted at `/api/v1` and the `/api` alias. Client-only routes live in `src/edges/legacy/` at the same paths and the same auth. They are not aliased into v1. `GET /api/health` is served from `src/edges/ops/`. Test fixtures are served from `src/edges/test-fixtures/` at `/test-api/`. Auth middleware lives in `src/edges/_shared/auth/`. Access production imports neither Fastify nor oRPC. `Deprecation` and `Sunset` stay unset until M7.1. HTTP tests live next to those edge routes. Handler tests and domain tests stay in the modules. M3.4 is done on main (`67e24d6b4e5d5f76db883679cf3cf6983ff4c598`). M3.5 is done on main (`f422e83d14b1bb066f461d406b0b6eeaf9b821f6`). M3.6 is not done until review and merge. Zod schemas live in `packages/api-contracts/src/schemas/`. Domain code returns `Result`; only the HTTP adapter throws `ORPCError`.

**Token Format**: `tokenId:secret` for O(1) database lookups. The token service parses the token, looks up by tokenId, and compares the secret. `decideValidateToken` classifies the loaded facts. The auth middleware maps that closed error: a bad token is `401` `{ message: "Invalid token" }`, and a storage or hash failure is `503` with `Retry-After: 1`.

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

# ADR-001 route inventory (M0.4)

Inventory of every HTTP route `apps/api/src/app.ts` registers, including the registrars it calls. No route moved. Classification follows ADR §9 and plan M3.1–M3.3. Every row is classified. There is no open classification list.

A route is **integration** when a bearer token can complete it, or when the handler returns a resource refusal that is already part of that route's HTTP contract. ADR §9's "used by bots, agents, tools or the extension" names the public-API audience in §8.1 (bots, agents, `tools/notes-mirror`, future MCP). It does not require a caller inside this repo. Absence of a hit in `apps/extension` or `tools/` does not prove there is no public consumer. Plan M3.2 names the captures, tasks, lists, projects, notes, work, review, and history handlers as the integration handlers.

**Client-only** stays the group ADR §9 names (admin, session, passkey, signup, invitation) plus the organization-settings routes plan M3.3 names, plus the four mutations whose domain already refuses every non-session actor. Those four are not a new auth mode.

M3.1 copies every integration row unchanged: path suffix, request and response shapes, and error status and body, rooted at `/api/v1`. M3.2 moves those handlers, mounts `/api/v1` with token-only auth, and mounts the same router at `/api/` with today's combined auth because the web app still calls those paths. This inventory does not change a status, a body, or an auth check.

Paths are the OpenAPI `path:` strings in `packages/api-contracts/src/orpc/`. Fastify mounts the same URL with `:param` instead of `{param}` (`/api/captures/{id}` and `/api/captures/:id` are one route). Fixture routes have no contract `path:`; their URL is the Fastify path.

`combined` means session cookie or bearer token (`createCombinedAuthMiddleware`). In `apps/api/src/composition-root.ts` the middleware passed into `createApp` is combined when signup config exists, and bearer-token only (`createAuthMiddleware`) when it does not. Production enables signup, so the rows below say `combined`. Passkey, auth (except login), and token routes build their own combined middleware inside the registrar.

## How routes were enumerated

1. Registrars called from `apps/api/src/app.ts` (`registerOrpcHealthRoutes`, `registerOrpcCaptureRoutes`, `registerListRoutes`, `registerProjectRoutes`, `registerNoteRoutes`, `registerTaskRoutes`, `registerWorkRoutes`, `registerReviewRoutes`, `registerReviewFixtureRoutes`, `registerOwnerlessWorkspaceFixtureRoutes`, `registerAdminRoutes`, `registerInvitationRoutes`, `registerSignupRoutes`, `registerPasskeyRoutes`, `registerAuthRoutes`, `registerOrganizationRoutes`, `registerTokenRoutes`).
2. Every `app.route` / `mount(` / `app.get` / `authedApp.post` URL in those files.
3. Every `path:` in `packages/api-contracts/src/orpc/*.ts` (105 procedures). Each appears once below, paired with its `method:`.
4. The five fixture URLs are not in the contracts. They are included. 105 + 5 = 110 rows.
5. Callers were searched in `apps/web`, `apps/admin`, `apps/extension`, `tools/`, and `packages/acceptance-testing` (path strings and oRPC procedure calls on the clients in `apps/web/src/api/client.ts` and `apps/admin/src/api/client.ts`). `tests` means `packages/acceptance-testing` only. API unit tests under `apps/api` were not counted as callers.

Static files and the SPA not-found handler are [not API procedures](#static-files-and-the-spa-fallback).

## Registration gates

| Registrar | Mounted when |
|---|---|
| Health, captures, lists, projects, notes, tasks, work, review, invitations | Always |
| Admin (`access/application/admin-routes.ts`) | `deps.admin` is set |
| Signup, passkey, auth, organization, token | `deps.signup` is set |
| Review fixtures | `enableTestFixtures` and a database (`YOINK_TEST_FIXTURES=true`) |
| Ownerless-workspace fixtures | `enableTestFixtures`, `deps.admin`, an invitation store, and a membership store |

## Counts

| Classification | Rows | Where it goes (ADR §9 / plan) |
|---|---:|---|
| integration | 59 | frozen v1 and the `/api` alias (M3.1, M3.2) |
| client-only | 45 | legacy until that client's edge (M3.3) |
| ops | 1 | stays `/api/health`, not v1 |
| test fixture | 5 | later `/test-api/` |
| ambiguous | 0 | none |
| **Total** | **110** | |

## Ops

| Method and path | Current file | Owning area | Auth | Callers | Classification | Notes |
|---|---|---|---|---|---|---|
| GET /api/health | health/application/orpc-health-routes.ts | health | none | tests | ops | Not v1. Acceptance driver: `packages/acceptance-testing/src/drivers/http/health.ts`. Fly health checks are outside the searched trees. |

## Test fixtures

No contract `path:`. Admin-session fixtures use `createAdminSessionMiddleware`. Review fixtures use the same `authMiddleware` as resource routes (`combined` in production).

| Method and path | Current file | Owning area | Auth | Callers | Classification | Notes |
|---|---|---|---|---|---|---|
| POST /api/test/ownerless-workspace | access/infrastructure/http-ownerless-workspace-fixture-routes.ts | access | admin session | tests | test fixture | `packages/acceptance-testing/src/drivers/http/admin.ts` |
| POST /api/test/expire-invitation | access/infrastructure/http-ownerless-workspace-fixture-routes.ts | access | admin session | tests | test fixture | Same driver |
| POST /api/test/assign-owner-keeping-invite | access/infrastructure/http-ownerless-workspace-fixture-routes.ts | access | admin session | tests | test fixture | Same driver |
| POST /api/test/review-fixture/backdate | review/infrastructure/http-review-fixture-routes.ts | review | combined | tests | test fixture | HTTP and Playwright actors |
| POST /api/test/review-fixture/finish-task | review/infrastructure/http-review-fixture-routes.ts | review | combined | tests | test fixture | HTTP and Playwright actors |

## Client-only

ADR §9: admin (`/api/admin/...`), plus session, passkey, signup, and invitation flows used by the web app, are never aliased into v1. Organization settings are the same group: plan M3.3 names them. The four session-only mutations at the end of this section are included because `requireWebSessionPerson` already refuses a bearer token. Their middleware stays combined. The refusal body stays as it is.

### Admin

Mounted only when `deps.admin` is set. Login and logout do not run the admin-session middleware. Logout clears the admin cookie without reading it.

| Method and path | Current file | Owning area | Auth | Callers | Classification | Notes |
|---|---|---|---|---|---|---|
| POST /api/admin/login | access/application/admin-routes.ts | admin | none | admin, tests | client-only | |
| POST /api/admin/logout | access/application/admin-routes.ts | admin | none | admin, tests | client-only | |
| GET /api/admin/session | access/application/admin-routes.ts | admin | admin session | admin, tests | client-only | |
| GET /api/admin/organizations | access/application/admin-routes.ts | admin | admin session | admin, tests | client-only | |
| POST /api/admin/organizations | access/application/admin-routes.ts | admin | admin session | admin, tests | client-only | |
| POST /api/admin/organizations/{id}/owner-invitation | access/application/admin-routes.ts | admin | admin session | admin, tests | client-only | |
| GET /api/admin/organizations/{id}/owner-invitation | access/application/admin-routes.ts | admin | admin session | admin, tests | client-only | |
| GET /api/admin/organizations/{id} | access/application/admin-routes.ts | admin | admin session | admin, tests | client-only | |
| PATCH /api/admin/organizations/{id} | access/application/admin-routes.ts | admin | admin session | admin, tests | client-only | |
| GET /api/admin/organizations/{organizationId}/users | access/application/admin-routes.ts | admin | admin session | admin, tests | client-only | |
| POST /api/admin/organizations/{organizationId}/users | access/application/admin-routes.ts | admin | admin session | admin, tests | client-only | |
| PUT /api/admin/organizations/{id}/owner | access/application/admin-routes.ts | admin | admin session | admin, tests | client-only | |
| PATCH /api/admin/organizations/{id}/members/{userId} | access/application/admin-routes.ts | admin | admin session | admin, tests | client-only | |
| GET /api/admin/users/{id} | access/application/admin-routes.ts | admin | admin session | admin, tests | client-only | |
| PATCH /api/admin/users/{id} | access/application/admin-routes.ts | admin | admin session | tests | client-only | No call in `apps/admin`. Acceptance admin driver patches the display name. |
| PATCH /api/admin/projects/{id} | access/application/admin-routes.ts | admin | admin session | tests | client-only | Contract summary: back-date `createdAt` for history-start fixtures. Path is `/api/admin/...`, so §9 keeps it client-only. No admin UI caller. |
| GET /api/admin/organizations/{organizationId}/tokens | access/application/admin-routes.ts | admin | admin session | admin, tests | client-only | |
| POST /api/admin/organizations/{organizationId}/tokens | access/application/admin-routes.ts | admin | admin session | admin, tests | client-only | |
| DELETE /api/admin/tokens/{id} | access/application/admin-routes.ts | admin | admin session | admin, tests | client-only | |
| POST /api/admin/organizations/{organizationId}/invitations | access/application/admin-routes.ts | admin | admin session | admin, tests | client-only | |

### Session, passkey, and signup

Signup, passkey, and auth are mounted only when `deps.signup` is set. Login is public (`isPublicRoute` matches `/auth/login/`). Logout and session use combined auth. Logout revokes a session only when the cookie was the credential; a bearer token still passes the middleware and only clears the cookie.

| Method and path | Current file | Owning area | Auth | Callers | Classification | Notes |
|---|---|---|---|---|---|---|
| POST /api/auth/login/options | access/application/auth-routes.ts | auth | none | web | client-only | `apps/web/src/api/auth.ts`. Acceptance signup drives the page and does not name this path. |
| POST /api/auth/login/verify | access/application/auth-routes.ts | auth | none | web | client-only | Same as login options |
| POST /api/auth/logout | access/application/auth-routes.ts | auth | combined | web | client-only | `apps/web/src/api/auth.ts` |
| GET /api/auth/session | access/application/auth-routes.ts | auth | combined | web, tests | client-only | Web `auth.ts` and `authClient.session`. HTTP and Playwright actors. |
| POST /api/auth/signup/options | access/application/signup-routes.ts | signup | none | web | client-only | `apps/web/src/api/auth.ts` |
| POST /api/auth/signup/verify | access/application/signup-routes.ts | signup | none | web | client-only | `apps/web/src/api/auth.ts` |
| POST /api/auth/passkey/register/options | access/application/passkey-routes.ts | passkey | combined | web | client-only | `apps/web/src/api/passkey.ts` |
| POST /api/auth/passkey/register/verify | access/application/passkey-routes.ts | passkey | combined | web | client-only | `apps/web/src/api/passkey.ts` |
| GET /api/auth/passkey/credentials | access/application/passkey-routes.ts | passkey | combined | web, tests | client-only | |
| DELETE /api/auth/passkey/credentials/{credentialId} | access/application/passkey-routes.ts | passkey | combined | web, tests | client-only | |

### Invitations

Always mounted. Only `POST /api/invitations/validate` skips auth (`isPublicRoute`). The other four use the app `authMiddleware`.

| Method and path | Current file | Owning area | Auth | Callers | Classification | Notes |
|---|---|---|---|---|---|---|
| POST /api/invitations | access/application/invitation-routes.ts | invitations | combined | web, tests | client-only | |
| POST /api/invitations/validate | access/application/invitation-routes.ts | invitations | none | web | client-only | Public. Acceptance signup does not name this path. |
| POST /api/invitations/accept | access/application/invitation-routes.ts | invitations | combined | web | client-only | `apps/web/src/api/auth.ts`. Not named in `packages/acceptance-testing`. |
| GET /api/organizations/{organizationId}/invitations | access/application/invitation-routes.ts | invitations | combined | web, tests | client-only | Pending list. Not the admin create route. |
| DELETE /api/invitations/{invitationId} | access/application/invitation-routes.ts | invitations | combined | web, tests | client-only | |

### Organization settings

Mounted only when `deps.signup` is set. All use the app `authMiddleware`.

| Method and path | Current file | Owning area | Auth | Callers | Classification | Notes |
|---|---|---|---|---|---|---|
| POST /api/organizations/switch | access/application/organization-routes.ts | organizations | combined | web, tests | client-only | Web `auth.ts`. Playwright actor and page object. |
| POST /api/organizations/{organizationId}/leave | access/application/organization-routes.ts | organizations | combined | web, tests | client-only | |
| POST /api/organizations/{organizationId}/owner/transfer | access/application/organization-routes.ts | organizations | combined | web | client-only | `organizationClient.transferOwner` in `apps/web/src/components/ownership-card.tsx`. Not named in `packages/acceptance-testing`. |
| GET /api/organizations/{organizationId}/members | access/application/organization-routes.ts | organizations | combined | web, tests | client-only | |
| PATCH /api/organizations/{organizationId}/members/{userId}/role | access/application/organization-routes.ts | organizations | combined | web, tests | client-only | |
| DELETE /api/organizations/{organizationId}/members/{userId} | access/application/organization-routes.ts | organizations | combined | web, tests | client-only | |


### Session-only token mutations

Mounted only when `deps.signup` is set. The registrar still uses combined auth, so a bearer token reaches the handler. `requireWebSessionPerson` (`access/domain/require-web-session-person.ts`) then refuses `actor.via !== 'session'`. Personal API tokens and agent tokens both fail. The domain error is `BOT_CANNOT_MANAGE_TOKENS` with message `API tokens cannot create, reissue, or revoke tokens; sign in to the web app.` Create and delete map that to `FORBIDDEN` in `token-routes.ts`. Mint maps it to `FORBIDDEN` in `mintAgentFailure`. Reissue maps it to `FORBIDDEN` with `bodyCode: BOT_CANNOT_MANAGE_TOKENS` in `reissueAgentTokenErrorResponse`. Do not change those statuses or messages. `GET /api/auth/tokens` is not in this table: listing has no session gate and is integration.

| Method and path | Current file | Owning area | Auth | Callers | Classification | Notes |
|---|---|---|---|---|---|---|
| POST /api/auth/tokens | access/application/token-routes.ts | tokens | combined | web, tests | client-only | `decide-create-token.ts` calls `requireWebSessionPerson`. Web settings: `apps/web/src/components/tokens-section.tsx`. |
| DELETE /api/auth/tokens/{tokenId} | access/application/token-routes.ts | tokens | combined | web, tests | client-only | `decide-revoke-token.ts` calls `requireWebSessionPerson`. |
| POST /api/organizations/{organizationId}/agents | access/application/organization-routes.ts | organizations | combined | web, tests | client-only | `agent-service.ts` documents a web-session person. HTTP actor: personal and agent tokens get 403. Web mint: `apps/web/src/api/auth.ts`. |
| POST /api/organizations/{organizationId}/members/{userId}/token | access/application/organization-routes.ts | organizations | combined | web, tests | client-only | `decide-reissue-agent-token.ts` calls `requireWebSessionPerson`. Web reissue: `members-section.tsx`. |


## Integration

These 59 routes are the frozen v1 surface. M3.1 copies each contract unchanged. M3.2 serves that copy at `/api/v1` with token-only auth and at `/api/` with today's combined auth. In-repo integrators are evidence, not the boundary: the extension calls `POST /api/captures` and `GET /api/captures` (`apps/extension/src/lib/api-client.ts`); notes-mirror calls `GET /api/notes/changed` and `POST /api/notes/import` (`tools/notes-mirror/src/infrastructure/yoink-api.ts`). The other rows below are the same token-capable resource API. A missing extension or tools caller does not move them to client-only.

Refusals that already exist stay in the copied contract. Do not retarget them:

- `POST /api/captures` refuses an agent with `FORBIDDEN` and message `Agents cannot create captures` (`mapAgentCaptureRefusal`).
- `POST /api/captures/{id}/process` maps `CAPTURE_NOT_IN_INBOX` to `BAD_REQUEST` and message `Capture must be in inbox to be processed` (`mapProcessCaptureError`). That 400 stays. It is not retargeted to 409.
- `POST /api/captures/{id}/process-to-project` keeps its own mapping (`mapProcessCaptureToProjectError`): `PROJECT_CREATE_REQUIRES_PERSON` is `FORBIDDEN` with the domain message; `CAPTURE_NOT_IN_INBOX` is `CONFLICT` and message `Capture must be in the inbox`. Person-only project routes (`apply`, `discard`, `confirm`, `decline`, `restore`) keep the contract summaries and the handlers' current refusals.
- `GET /api/auth/tokens` stays integration. `handleListTokens` lists by the auth context's user and organization and does not call `requireWebSessionPerson`, so a bearer token receives today's list body.

§8.2 screen composition is how the future web edge may assemble Now and Review. It does not drop `GET /api/work/*` or `GET /api/review` from v1. Those handlers have no session-only gate.

| Method and path | Current file | Owning area | Auth | Callers | Classification | Notes |
|---|---|---|---|---|---|---|
| POST /api/captures | captures/infrastructure/orpc-capture-routes.ts | captures | combined | extension, web, tests | integration | Agents are refused (`mapAgentCaptureRefusal` in `orpc-capture-errors.ts`). The extension uses a human token. |
| GET /api/captures | captures/infrastructure/orpc-capture-routes.ts | captures | combined | extension, web, tests | integration | Extension calls `list` with `limit=1` to check the token. |
| GET /api/notes/changed | notes/infrastructure/http-note-routes.ts | notes | combined | tools, tests | integration | Contract summary: notes-mirror bot. Web does not call `noteClient.listChanged`. |
| POST /api/notes/import | notes/infrastructure/http-note-routes.ts | notes | combined | tools, tests | integration | Contract summary: Obsidian mirror import. Web does not call `noteClient.importFromObsidian`. |

### Captures other than the two extension routes (10)

Web calls every row except PATCH. The token acceptance driver calls all ten. `POST .../process` and `POST .../process-to-project` are mounted from the capture registrar and call the processing workflow.

| Method and path | Current file | Owning area | Auth | Callers | Classification | Notes |
|---|---|---|---|---|---|---|
| GET /api/captures/{id} | captures/infrastructure/orpc-capture-routes.ts | captures | combined | web, tests | integration | |
| PATCH /api/captures/{id} | captures/infrastructure/orpc-capture-routes.ts | captures | combined | tests | integration | No `captureClient.update` in `apps/web`. |
| POST /api/captures/{id}/trash | captures/infrastructure/orpc-capture-routes.ts | captures | combined | web, tests | integration | |
| POST /api/captures/{id}/restore | captures/infrastructure/orpc-capture-routes.ts | captures | combined | web, tests | integration | |
| POST /api/captures/{id}/snooze | captures/infrastructure/orpc-capture-routes.ts | captures | combined | web, tests | integration | |
| POST /api/captures/{id}/unsnooze | captures/infrastructure/orpc-capture-routes.ts | captures | combined | web, tests | integration | |
| DELETE /api/captures/{id} | captures/infrastructure/orpc-capture-routes.ts | captures | combined | web, tests | integration | |
| POST /api/captures/trash/empty | captures/infrastructure/orpc-capture-routes.ts | captures | combined | web, tests | integration | |
| POST /api/captures/{id}/process | captures/infrastructure/orpc-capture-routes.ts | processing | combined | web, tests | integration | Processing workflow, capture registrar. `CAPTURE_NOT_IN_INBOX` stays `BAD_REQUEST` / `Capture must be in inbox to be processed`. |
| POST /api/captures/{id}/process-to-project | captures/infrastructure/orpc-capture-routes.ts | processing | combined | web, tests | integration | Separate contract `processCaptureToProjectOrpcContract`. Contract summary: person only. `CAPTURE_NOT_IN_INBOX` stays `CONFLICT` / `Capture must be in the inbox`. `PROJECT_CREATE_REQUIRES_PERSON` stays `FORBIDDEN`. |

### Tasks (10)

Web does not call get, pin, unpin, or task history.

| Method and path | Current file | Owning area | Auth | Callers | Classification | Notes |
|---|---|---|---|---|---|---|
| POST /api/tasks | tasks/infrastructure/http-task-routes.ts | tasks | combined | web, tests | integration | |
| GET /api/tasks | tasks/infrastructure/http-task-routes.ts | tasks | combined | web, tests | integration | |
| GET /api/tasks/{id} | tasks/infrastructure/http-task-routes.ts | tasks | combined | tests | integration | No `taskClient.get` in `apps/web`. |
| PATCH /api/tasks/{id} | tasks/infrastructure/http-task-routes.ts | tasks | combined | web, tests | integration | |
| POST /api/tasks/{id}/complete | tasks/infrastructure/http-task-routes.ts | tasks | combined | web, tests | integration | |
| POST /api/tasks/{id}/uncomplete | tasks/infrastructure/http-task-routes.ts | tasks | combined | web, tests | integration | |
| POST /api/tasks/{id}/pin | tasks/infrastructure/http-task-routes.ts | tasks | combined | tests | integration | No `taskClient.pin` in `apps/web`. |
| POST /api/tasks/{id}/unpin | tasks/infrastructure/http-task-routes.ts | tasks | combined | tests | integration | No `taskClient.unpin` in `apps/web`. |
| GET /api/tasks/{id}/history | tasks/infrastructure/http-task-routes.ts | history | combined | tests | integration | History handler, task registrar. Web reads project history, not task history. |
| DELETE /api/tasks/{id} | tasks/infrastructure/http-task-routes.ts | tasks | combined | web, tests | integration | |

### Lists and the unlisted pile (8)

Web calls all eight (`listClient`).

| Method and path | Current file | Owning area | Auth | Callers | Classification | Notes |
|---|---|---|---|---|---|---|
| GET /api/lists | lists/infrastructure/http-list-routes.ts | lists | combined | web, tests | integration | |
| POST /api/lists | lists/infrastructure/http-list-routes.ts | lists | combined | web, tests | integration | |
| PATCH /api/lists/{id} | lists/infrastructure/http-list-routes.ts | lists | combined | web, tests | integration | |
| DELETE /api/lists/{id} | lists/infrastructure/http-list-routes.ts | lists | combined | web, tests | integration | |
| GET /api/lists/{id}/tasks | lists/infrastructure/http-list-routes.ts | lists | combined | web, tests | integration | |
| PUT /api/lists/{id}/tasks/order | lists/infrastructure/http-list-routes.ts | lists | combined | web, tests | integration | |
| GET /api/unlisted/tasks | lists/infrastructure/http-list-routes.ts | lists | combined | web, tests | integration | |
| PUT /api/unlisted/tasks/order | lists/infrastructure/http-list-routes.ts | lists | combined | web, tests | integration | |

### Projects, imports, and project history (16)

Web does not call `POST /api/projects/imports` (`projectClient.stageImport` is unused). Contract summary for that route: bots and people. `GET /api/projects/{id}/history` uses the history handler inside the project registrar. Web calls the other fifteen.

| Method and path | Current file | Owning area | Auth | Callers | Classification | Notes |
|---|---|---|---|---|---|---|
| GET /api/projects | projects/infrastructure/http-project-routes.ts | projects | combined | web, tests | integration | |
| POST /api/projects | projects/infrastructure/http-project-routes.ts | projects | combined | web, tests | integration | Contract summary: a person creates, a bot proposes. |
| POST /api/projects/imports | projects/infrastructure/http-project-routes.ts | projects | combined | tests | integration | No web caller. Contract summary names bots and people. |
| GET /api/projects/imports | projects/infrastructure/http-project-routes.ts | projects | combined | web, tests | integration | |
| GET /api/projects/imports/{id} | projects/infrastructure/http-project-routes.ts | projects | combined | web, tests | integration | |
| POST /api/projects/imports/{id}/apply | projects/infrastructure/http-project-routes.ts | projects | combined | web, tests | integration | Contract summary: person only. |
| POST /api/projects/imports/{id}/discard | projects/infrastructure/http-project-routes.ts | projects | combined | web, tests | integration | Contract summary: person only. |
| GET /api/projects/{id} | projects/infrastructure/http-project-routes.ts | projects | combined | web, tests | integration | |
| PATCH /api/projects/{id} | projects/infrastructure/http-project-routes.ts | projects | combined | web, tests | integration | |
| GET /api/projects/{id}/tasks | projects/infrastructure/http-project-routes.ts | projects | combined | web, tests | integration | |
| GET /api/projects/{id}/history | projects/infrastructure/http-project-routes.ts | history | combined | web, tests | integration | History handler, project registrar. |
| PUT /api/projects/{id}/status | projects/infrastructure/http-project-routes.ts | projects | combined | web, tests | integration | |
| POST /api/projects/{id}/confirm | projects/infrastructure/http-project-routes.ts | projects | combined | web, tests | integration | Contract summary: person only. |
| POST /api/projects/{id}/decline | projects/infrastructure/http-project-routes.ts | projects | combined | web, tests | integration | Contract summary: person only. |
| POST /api/projects/{id}/restore | projects/infrastructure/http-project-routes.ts | projects | combined | web, tests | integration | Contract summary: person only. |
| PUT /api/projects/{id}/next-action | projects/infrastructure/http-project-routes.ts | projects | combined | web, tests | integration | |

### Project note CRUD (5)

Not the notes-mirror routes above. Web `noteClient` calls these five. Same integration class.

| Method and path | Current file | Owning area | Auth | Callers | Classification | Notes |
|---|---|---|---|---|---|---|
| GET /api/projects/{projectId}/notes | notes/infrastructure/http-note-routes.ts | notes | combined | web, tests | integration | |
| POST /api/projects/{projectId}/notes | notes/infrastructure/http-note-routes.ts | notes | combined | web, tests | integration | Contract summary: people and bots. |
| GET /api/projects/{projectId}/notes/{noteId} | notes/infrastructure/http-note-routes.ts | notes | combined | web, tests | integration | |
| PATCH /api/projects/{projectId}/notes/{noteId} | notes/infrastructure/http-note-routes.ts | notes | combined | web, tests | integration | |
| DELETE /api/projects/{projectId}/notes/{noteId} | notes/infrastructure/http-note-routes.ts | notes | combined | web, tests | integration | |

### Work and review (5)

Web Work and Review screens. The token acceptance driver calls them too. No extension or tools caller. Classified integration anyway: the handlers accept a bearer token and do not apply `requireWebSessionPerson`. M3.2 includes these route files in the v1 move.

| Method and path | Current file | Owning area | Auth | Callers | Classification | Notes |
|---|---|---|---|---|---|---|
| GET /api/work/next-actions | work/infrastructure/http-work-routes.ts | work | combined | web, tests | integration | |
| GET /api/work/due | work/infrastructure/http-work-routes.ts | work | combined | web, tests | integration | |
| GET /api/work/lists | work/infrastructure/http-work-routes.ts | work | combined | web, tests | integration | |
| GET /api/review | review/infrastructure/http-review-routes.ts | review | combined | web, tests | integration | |
| GET /api/review/done | review/infrastructure/http-review-routes.ts | review | combined | web, tests | integration | |

### Token list (1)

`GET /api/auth/tokens` is the read a bearer token can complete. Create and delete are client-only above.

| Method and path | Current file | Owning area | Auth | Callers | Classification | Notes |
|---|---|---|---|---|---|---|
| GET /api/auth/tokens | access/application/token-routes.ts | tokens | combined | web, tests | integration | `handleListTokens` has no session gate. Web settings also calls it (`tokens-section.tsx`). Copy the list body unchanged into v1. |


## Static files and the SPA fallback

These are not procedures and are not in the 110 rows.

- `@fastify/static` at prefix `/` when `apps/api/public/index.html` exists (`app.ts`). Hashed `/assets/` may be cached; HTML and PWA entry files are not.
- `@fastify/static` at prefix `/admin/` when `apps/api/public/admin` exists.
- `app.setNotFoundHandler` serves the admin `index.html` for `/admin...`, the web `index.html` for any non-`/api` path when that file exists, and otherwise 404 `{ message: 'Not found' }`. It is not a registered route.

## Checklist against `app.ts` and contract `path:`

| Source | Routes in this inventory |
|---|---|
| `health/application/orpc-health-routes.ts` and `orpc/health-contract.ts` | 1 |
| `captures/infrastructure/orpc-capture-routes.ts` and `orpc/capture-contract.ts` | 12 |
| `lists/infrastructure/http-list-routes.ts` and `orpc/list-contract.ts` | 8 |
| `projects/infrastructure/http-project-routes.ts` and `orpc/project-contract.ts` | 16 |
| `notes/infrastructure/http-note-routes.ts` and `orpc/note-contract.ts` | 7 |
| `tasks/infrastructure/http-task-routes.ts` and `orpc/task-contract.ts` | 10 |
| `work/infrastructure/http-work-routes.ts` and `orpc/work-contract.ts` | 3 |
| `review/infrastructure/http-review-routes.ts` and `orpc/review-contract.ts` | 2 |
| `review/infrastructure/http-review-fixture-routes.ts` | 2 (no contract) |
| `access/infrastructure/http-ownerless-workspace-fixture-routes.ts` | 3 (no contract) |
| `access/application/admin-routes.ts` and `orpc/admin-contract.ts` | 20 |
| `access/application/auth-routes.ts` and `orpc/auth-contract.ts` | 4 |
| `access/application/signup-routes.ts` and `orpc/signup-contract.ts` | 2 |
| `access/application/passkey-routes.ts` and `orpc/passkey-contract.ts` | 4 |
| `access/application/token-routes.ts` and `orpc/token-contract.ts` | 3 |
| `access/application/invitation-routes.ts` and `orpc/invitation-contract.ts` | 5 |
| `access/application/organization-routes.ts` and `orpc/organization-contract.ts` | 8 |
| **Total** | **110** |

Contract files with no extra path: `packages/api-contracts/src/orpc/index.ts` only re-exports.

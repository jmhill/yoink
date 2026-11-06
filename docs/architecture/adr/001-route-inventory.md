# ADR-001 route inventory (M0.4)

Inventory of every HTTP route `apps/api/src/app.ts` registers, including the registrars it calls. No route moved. Classification follows ADR §9 and does not change it. Rows that §9 does not settle are **ambiguous** and are listed again under [Ambiguous rows](#ambiguous-rows). Justin decides those before M3.1. This file does not decide them.

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
| integration | 4 | v1 and the `/api` alias |
| client-only | 41 | legacy until that client's edge |
| ops | 1 | stays `/api/health`, not v1 |
| test fixture | 5 | later `/test-api/` |
| ambiguous | 59 | not guessed; see below |
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

ADR §9: admin (`/api/admin/...`), plus session, passkey, signup, and invitation flows used by the web app, are never aliased into v1. Organization settings below are the same group: migration plan M3.3 names them, and the only production caller is the web app. Agent mint and token reissue are not in this table; they are ambiguous.

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

## Integration

Usable with a bearer token, and an in-repo integrator calls them. Extension callers are `POST /api/captures` and `GET /api/captures` (`apps/extension/src/lib/api-client.ts`). The notes-mirror bot calls the two note routes (`tools/notes-mirror/src/infrastructure/yoink-api.ts`).

| Method and path | Current file | Owning area | Auth | Callers | Classification | Notes |
|---|---|---|---|---|---|---|
| POST /api/captures | captures/infrastructure/orpc-capture-routes.ts | captures | combined | extension, web, tests | integration | Agents are refused (`mapAgentCaptureRefusal` in `orpc-capture-errors.ts`). The extension uses a human token. |
| GET /api/captures | captures/infrastructure/orpc-capture-routes.ts | captures | combined | extension, web, tests | integration | Extension calls `list` with `limit=1` to check the token. |
| GET /api/notes/changed | notes/infrastructure/http-note-routes.ts | notes | combined | tools, tests | integration | Contract summary: notes-mirror bot. Web does not call `noteClient.listChanged`. |
| POST /api/notes/import | notes/infrastructure/http-note-routes.ts | notes | combined | tools, tests | integration | Contract summary: Obsidian mirror import. Web does not call `noteClient.importFromObsidian`. |

## Ambiguous rows

These accept a bearer token, so they could be v1, but no caller in `apps/extension` or `tools/` was found. The web app and/or the token acceptance driver do call them. Two readings, not picked:

- **Integration.** Same combined-auth resource routers M3.2 names (captures, tasks, lists, projects, notes, work, review, history). The HTTP actor (`packages/acceptance-testing/src/drivers/http/actor.ts`) calls them with a bearer token. Some contract summaries mention bots.
- **Client-only.** The only production UI is the web app, which later moves to `/web-api/`. Work and review match the screen composition ADR §8.2 assigns to an edge. Token self-service, agent mint, and token reissue match the auth and organization-settings legacy group, except that §9 does not name them.

59 rows. Each is also in the table below.

### Captures other than the two extension routes (10)

Web calls every row except PATCH. The token acceptance driver calls all ten. `POST .../process` and `POST .../process-to-project` are mounted from the capture registrar and call the processing workflow.

| Method and path | Current file | Owning area | Auth | Callers | Classification | Notes |
|---|---|---|---|---|---|---|
| GET /api/captures/{id} | captures/infrastructure/orpc-capture-routes.ts | captures | combined | web, tests | ambiguous | |
| PATCH /api/captures/{id} | captures/infrastructure/orpc-capture-routes.ts | captures | combined | tests | ambiguous | No `captureClient.update` in `apps/web`. |
| POST /api/captures/{id}/trash | captures/infrastructure/orpc-capture-routes.ts | captures | combined | web, tests | ambiguous | |
| POST /api/captures/{id}/restore | captures/infrastructure/orpc-capture-routes.ts | captures | combined | web, tests | ambiguous | |
| POST /api/captures/{id}/snooze | captures/infrastructure/orpc-capture-routes.ts | captures | combined | web, tests | ambiguous | |
| POST /api/captures/{id}/unsnooze | captures/infrastructure/orpc-capture-routes.ts | captures | combined | web, tests | ambiguous | |
| DELETE /api/captures/{id} | captures/infrastructure/orpc-capture-routes.ts | captures | combined | web, tests | ambiguous | |
| POST /api/captures/trash/empty | captures/infrastructure/orpc-capture-routes.ts | captures | combined | web, tests | ambiguous | |
| POST /api/captures/{id}/process | captures/infrastructure/orpc-capture-routes.ts | processing | combined | web, tests | ambiguous | Processing workflow, capture registrar. |
| POST /api/captures/{id}/process-to-project | captures/infrastructure/orpc-capture-routes.ts | processing | combined | web, tests | ambiguous | Separate contract `processCaptureToProjectOrpcContract`. Contract summary: person only. |

### Tasks (10)

Web does not call get, pin, unpin, or task history.

| Method and path | Current file | Owning area | Auth | Callers | Classification | Notes |
|---|---|---|---|---|---|---|
| POST /api/tasks | tasks/infrastructure/http-task-routes.ts | tasks | combined | web, tests | ambiguous | |
| GET /api/tasks | tasks/infrastructure/http-task-routes.ts | tasks | combined | web, tests | ambiguous | |
| GET /api/tasks/{id} | tasks/infrastructure/http-task-routes.ts | tasks | combined | tests | ambiguous | No `taskClient.get` in `apps/web`. |
| PATCH /api/tasks/{id} | tasks/infrastructure/http-task-routes.ts | tasks | combined | web, tests | ambiguous | |
| POST /api/tasks/{id}/complete | tasks/infrastructure/http-task-routes.ts | tasks | combined | web, tests | ambiguous | |
| POST /api/tasks/{id}/uncomplete | tasks/infrastructure/http-task-routes.ts | tasks | combined | web, tests | ambiguous | |
| POST /api/tasks/{id}/pin | tasks/infrastructure/http-task-routes.ts | tasks | combined | tests | ambiguous | No `taskClient.pin` in `apps/web`. |
| POST /api/tasks/{id}/unpin | tasks/infrastructure/http-task-routes.ts | tasks | combined | tests | ambiguous | No `taskClient.unpin` in `apps/web`. |
| GET /api/tasks/{id}/history | tasks/infrastructure/http-task-routes.ts | history | combined | tests | ambiguous | History handler, task registrar. Web reads project history, not task history. |
| DELETE /api/tasks/{id} | tasks/infrastructure/http-task-routes.ts | tasks | combined | web, tests | ambiguous | |

### Lists and the unlisted pile (8)

Web calls all eight (`listClient`).

| Method and path | Current file | Owning area | Auth | Callers | Classification | Notes |
|---|---|---|---|---|---|---|
| GET /api/lists | lists/infrastructure/http-list-routes.ts | lists | combined | web, tests | ambiguous | |
| POST /api/lists | lists/infrastructure/http-list-routes.ts | lists | combined | web, tests | ambiguous | |
| PATCH /api/lists/{id} | lists/infrastructure/http-list-routes.ts | lists | combined | web, tests | ambiguous | |
| DELETE /api/lists/{id} | lists/infrastructure/http-list-routes.ts | lists | combined | web, tests | ambiguous | |
| GET /api/lists/{id}/tasks | lists/infrastructure/http-list-routes.ts | lists | combined | web, tests | ambiguous | |
| PUT /api/lists/{id}/tasks/order | lists/infrastructure/http-list-routes.ts | lists | combined | web, tests | ambiguous | |
| GET /api/unlisted/tasks | lists/infrastructure/http-list-routes.ts | lists | combined | web, tests | ambiguous | |
| PUT /api/unlisted/tasks/order | lists/infrastructure/http-list-routes.ts | lists | combined | web, tests | ambiguous | |

### Projects, imports, and project history (16)

Web does not call `POST /api/projects/imports` (`projectClient.stageImport` is unused). Contract summary for that route: bots and people. `GET /api/projects/{id}/history` uses the history handler inside the project registrar. Web calls the other fifteen.

| Method and path | Current file | Owning area | Auth | Callers | Classification | Notes |
|---|---|---|---|---|---|---|
| GET /api/projects | projects/infrastructure/http-project-routes.ts | projects | combined | web, tests | ambiguous | |
| POST /api/projects | projects/infrastructure/http-project-routes.ts | projects | combined | web, tests | ambiguous | Contract summary: a person creates, a bot proposes. |
| POST /api/projects/imports | projects/infrastructure/http-project-routes.ts | projects | combined | tests | ambiguous | No web caller. Contract summary names bots and people. |
| GET /api/projects/imports | projects/infrastructure/http-project-routes.ts | projects | combined | web, tests | ambiguous | |
| GET /api/projects/imports/{id} | projects/infrastructure/http-project-routes.ts | projects | combined | web, tests | ambiguous | |
| POST /api/projects/imports/{id}/apply | projects/infrastructure/http-project-routes.ts | projects | combined | web, tests | ambiguous | Contract summary: person only. |
| POST /api/projects/imports/{id}/discard | projects/infrastructure/http-project-routes.ts | projects | combined | web, tests | ambiguous | Contract summary: person only. |
| GET /api/projects/{id} | projects/infrastructure/http-project-routes.ts | projects | combined | web, tests | ambiguous | |
| PATCH /api/projects/{id} | projects/infrastructure/http-project-routes.ts | projects | combined | web, tests | ambiguous | |
| GET /api/projects/{id}/tasks | projects/infrastructure/http-project-routes.ts | projects | combined | web, tests | ambiguous | |
| GET /api/projects/{id}/history | projects/infrastructure/http-project-routes.ts | history | combined | web, tests | ambiguous | History handler, project registrar. |
| PUT /api/projects/{id}/status | projects/infrastructure/http-project-routes.ts | projects | combined | web, tests | ambiguous | |
| POST /api/projects/{id}/confirm | projects/infrastructure/http-project-routes.ts | projects | combined | web, tests | ambiguous | Contract summary: person only. |
| POST /api/projects/{id}/decline | projects/infrastructure/http-project-routes.ts | projects | combined | web, tests | ambiguous | Contract summary: person only. |
| POST /api/projects/{id}/restore | projects/infrastructure/http-project-routes.ts | projects | combined | web, tests | ambiguous | Contract summary: person only. |
| PUT /api/projects/{id}/next-action | projects/infrastructure/http-project-routes.ts | projects | combined | web, tests | ambiguous | |

### Project note CRUD (5)

Not the notes-mirror routes, which are integration. Web `noteClient` calls these five.

| Method and path | Current file | Owning area | Auth | Callers | Classification | Notes |
|---|---|---|---|---|---|---|
| GET /api/projects/{projectId}/notes | notes/infrastructure/http-note-routes.ts | notes | combined | web, tests | ambiguous | |
| POST /api/projects/{projectId}/notes | notes/infrastructure/http-note-routes.ts | notes | combined | web, tests | ambiguous | Contract summary: people and bots. |
| GET /api/projects/{projectId}/notes/{noteId} | notes/infrastructure/http-note-routes.ts | notes | combined | web, tests | ambiguous | |
| PATCH /api/projects/{projectId}/notes/{noteId} | notes/infrastructure/http-note-routes.ts | notes | combined | web, tests | ambiguous | |
| DELETE /api/projects/{projectId}/notes/{noteId} | notes/infrastructure/http-note-routes.ts | notes | combined | web, tests | ambiguous | |

### Work and review screens (5)

Web Work and Review screens. The token acceptance driver calls them too. No extension or tools caller. ADR §8.2 describes this kind of screen composition as edge work. M3.2 names the work and review route files only if this inventory classifies them integration.

| Method and path | Current file | Owning area | Auth | Callers | Classification | Notes |
|---|---|---|---|---|---|---|
| GET /api/work/next-actions | work/infrastructure/http-work-routes.ts | work | combined | web, tests | ambiguous | |
| GET /api/work/due | work/infrastructure/http-work-routes.ts | work | combined | web, tests | ambiguous | |
| GET /api/work/lists | work/infrastructure/http-work-routes.ts | work | combined | web, tests | ambiguous | |
| GET /api/review | review/infrastructure/http-review-routes.ts | review | combined | web, tests | ambiguous | |
| GET /api/review/done | review/infrastructure/http-review-routes.ts | review | combined | web, tests | ambiguous | |

### Token self-service (3)

Mounted only when `deps.signup` is set. Combined middleware built in `token-routes.ts`. Production caller is the web token settings screen (`apps/web/src/components/tokens-section.tsx`). The HTTP actor also lists, creates, and deletes tokens with a bearer token. §9's client-only list does not name token self-service. M3.3 groups "auth" as client-only.

| Method and path | Current file | Owning area | Auth | Callers | Classification | Notes |
|---|---|---|---|---|---|---|
| GET /api/auth/tokens | access/application/token-routes.ts | tokens | combined | web, tests | ambiguous | |
| POST /api/auth/tokens | access/application/token-routes.ts | tokens | combined | web, tests | ambiguous | |
| DELETE /api/auth/tokens/{tokenId} | access/application/token-routes.ts | tokens | combined | web, tests | ambiguous | |

### Agent credentials (2)

Web organization settings (`apps/web/src/api/auth.ts` mints; `members-section.tsx` reissues). The HTTP actor comment says minting is web-session only and that personal and agent tokens both get 403 on `POST /agents`. Reissue returns a new raw token. Not named in the §9 examples.

| Method and path | Current file | Owning area | Auth | Callers | Classification | Notes |
|---|---|---|---|---|---|---|
| POST /api/organizations/{organizationId}/agents | access/application/organization-routes.ts | organizations | combined | web, tests | ambiguous | |
| POST /api/organizations/{organizationId}/members/{userId}/token | access/application/organization-routes.ts | organizations | combined | web, tests | ambiguous | |

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

# Yoink Implementation Plan

This document tracks the implementation progress of the Yoink universal capture system. It serves as a persistent "master plan" that carries context across Claude sessions.

For the full design document and architectural details, see [PROJECT_BRIEF.md](./design/PROJECT_BRIEF.md).

For initial product vision and roadmap, see [PRODUCT_VISION.md](./design/PRODUCT_VISION.md).

---

## Current Status

**Phases 1-6: Foundation through Observability** - Complete ✓
**Phase 7: Authentication Overhaul** - Complete ✓
**Phase 8: Capture → Task Flow** - Complete ✓
**Invitation Flow Improvements** - Complete ✓
**Phase 8.5: Architecture Cleanup** - In Progress (8.5.1–8.5.3 complete; modules are now DDD bounded contexts — `access/` holds auth, users, orgs, memberships, invitations, admin)
**Identity slice: Agent principals** - Complete ✓ (token-only org members; task assignee field; agents cannot capture or passkey; Playwright proves the assigned row and edit picker)
**Identity slice: Mine / assigned-to-me list** - Complete ✓ (`GET /api/tasks?filter=mine`; Tasks page Mine tab; unassigned excluded)
**Identity slice: Agent member roster** - Complete ✓ (agent tokens can GET org members to pick an assignee; still cannot mint, remove, or capture)
**Captures functional-core pilot** - Complete ✓ (see [FUNCTIONAL_CORE.md](./architecture/FUNCTIONAL_CORE.md))
**CI: Node 20 action deprecation** - Complete ✓ (#47)
**CI: pnpm 9 → 11** - Complete ✓ (#48)
**Named lists: View my named lists** - Complete ✓ (org-scoped read model; empty view + names)
**Named lists: Create a new named list** - Complete ✓ (any member including agents; product `POST /api/lists`; Lists page create)
**Named lists: Add an existing task to a list** - Complete ✓ (`listId` on tasks; PATCH sandwich; kit picker on task edit)
**Named lists: Add a new task to a list directly** - Complete ✓ (optional `listId` on create; create sandwich; kit picker on quick-add)
**Named lists: Take a task off a list** - Complete ✓ (`listId: null` on PATCH; open tasks only; kit picker can clear)
**Named lists: Delete an empty named list** - Complete ✓ (`DELETE /api/lists/:id`; refuse if any open task; completed unlisted in the same command)
**Named lists: Order tasks in a list** - Complete ✓ (integer `openOrder` per pile; list open tasks + reorder; complete/uncomplete sandwich; kit up/down on the list)
**Named lists: Order unlisted tasks** - Complete ✓ (`GET`/`PUT` `/api/unlisted/tasks`; same `openOrder` pile; kit up/down; All/Today/Mine/Upcoming unchanged)
**All has two modes** - Complete ✓ (All overview groups by list + unlisted, no reorder; one-pile named/unlisted reuse existing pile APIs with kit up/down)
**Create a named list from All** - Complete ✓ (New list on the All pile dropdown; same unique-in-org create; lands on that empty one-pile view)
**Delete a named list from All** - Complete ✓ (kit delete on All’s named-list one-pile only; same refuse-if-open-tasks; lands on overview)
**Today and Upcoming group by list** - Complete ✓ (Today/Upcoming grouped overviews; Today outer split is overdue then due today, list groups inside; Upcoming is list groups only; no reorder)
**Mine uses All’s two-mode picker** - Complete ✓ (Mine overview grouped by list + unlisted; one named list or Unlisted; only my assigned tasks; no reorder even in one-pile; All still reorders)
**Lists nav dies** - Complete ✓ (no Lists nav or Lists pages; piles live on Tasks All and Mine; old `/lists` URLs redirect onto All)
**Yoink UI story 1: single rail + direct list screens** - Complete ✓ (desktop rail: Inbox with count hidden at 0, Today, Upcoming, Mine, Done, Lists heading, flat named lists, Unlisted, + New list; named list/Unlisted land on existing one-pile screens; All stays as fallback)

Recent updates:
- Yoink UI story 1 “single rail + direct list screens”: one desktop rail. Inbox shows a count, hidden when that count is 0. A small Lists heading sits above the named lists so they are not a fifth smart view; named lists stay flat, Unlisted last, then + New list. Smart views and named lists are peers (no nesting). Named list and Unlisted links land on the existing All one-pile screens (add-task field + kit up/down). Smart views keep current semantics (Today overdue then due today with list groups inside; Upcoming list groups; Mine assignee-only, no reorder; Done completed). All stays: tab, two-mode dropdown, create, delete-on-named-pile. Empty named lists stay findable on the rail and in All’s dropdown. Mobile Inbox | Tasks bottom nav stays. No list/task API or domain change. HTTP still only maps; no new domain field. Later-scope (not this story): move create-list/create-task, Inbox pane/Snoozed/Trash tabs, Promote sheet, mobile bottom-tab redesign, All retirement, visual polish, drag.
- Story 6 of 6 “Lists nav dies”: Lists is a dimension of the task board, not a second app. There is no Lists nav and no Lists pages. Members find and work piles on Tasks (All two-modes with create/delete/reorder; Mine is the same picker as a filter, no reorder, no create/delete). Today/Upcoming stay grouped; Done stays. Old URLs redirect: `/lists` → All overview (`?filter=all`), `/lists/unlisted` → All Unlisted (`?filter=all&pile=unlisted`), `/lists/:listId` → All named pile (`?filter=all&pile=:listId`). Empty named lists still appear in All’s (and Mine’s) pile dropdown. List APIs stay. HTTP still only maps; no new domain field.
- Story 5 of 6 “Mine uses All’s two-mode picker”: on Tasks Mine, a member can pick All lists (grouped overview, named list plus unlisted) vs one named list vs Unlisted — the same two modes as All. Mine is still only tasks assigned to the current member. Even in one-pile modes, no up/down; `openOrder` stays the shared pile sequence All already owns. Empty groups wait: only piles with MY tasks. Pin stays on the existing Mine filter sort (`pinned_at` then `created_at`), not `openOrder`. Create/delete list stay on All. Today, Upcoming, Done, and the Lists nav stay (story 6). HTTP still only maps; no new domain field. Reuses `GET /api/tasks?filter=mine` and groups/filters by pile on the client — not the list/unlisted pile APIs (those are everyone’s open tasks).
- Story 4 of 6 “Today and Upcoming group by list”: Today and Upcoming are grouped overviews and cannot reorder. Today is a deadline view: overdue vs due today on the outside, then named list plus unlisted inside each. Upcoming has no overdue split — just list groups. Pin still sits on the existing filter sort (pinned_at then created_at), not openOrder. Empty groups wait: only piles with tasks in that view. All two-modes, create/delete from All, Mine, Done, and the Lists nav stay. HTTP still only maps; no new domain field. Reuses `groupAllTasksByPile`.
- Story 3 of 6 “Delete a named list from All”: on Tasks All, when a member is looking at one named list, they can delete that list (kit dialog, same refuse-if-open-tasks already shipped). They cannot delete from the grouped overview or from Unlisted. After a successful delete, All leaves the named-list one-pile view and lands on overview — not Unlisted. The name is gone from the dropdown. Open tasks on that list: delete is refused, list stays, still on that pile. Today, Upcoming, Mine, Done, and the Lists nav stay. Lists page delete stays until story 6. Create from All stays as shipped. HTTP still only maps; no new domain rules.
- Story 2 of 6 “Create a named list from All”: on Tasks All, a member can create a named list from the pile dropdown (kit New list dialog, same unique-in-org rules as Lists page create). After create, All lands on that list’s one-pile view — empty is the confirmation it exists, because overview hides empty groups. Duplicate and empty names are refused the same as Lists create. No delete on All. Today, Upcoming, Mine, Done, and the Lists nav stay. HTTP still only maps; no new domain rules.
- Story “All has two modes”: on Tasks All, a member can switch between every pile at once (grouped by named list plus unlisted, no reorder, still pin-then-created within each group) and one pile (a named list, or unlisted) where kit up/down persists through the existing `GET`/`PUT` list and unlisted task APIs. Today, Upcoming, Mine, Done, and the Lists nav are unchanged. No create/delete list UI. No new domain field.
- Story 8 “Order unlisted tasks”: a member can see the open tasks that are not on a named list, in an order, and change that order. Same Polly lock as story 7, on the unlisted pile only — not a global rank across All. Completing drops a task out of that sequence but keeps the remembered index (and no `listId`). Uncomplete restores (clamp to the end if the pile got shorter). New unlisted tasks and take-off append to the end. Pin is unchanged and still sits on top of All/Today/Mine/Upcoming. Agent tokens can reorder; unauthenticated cannot; completed cannot be reordered. Named-list order (story 7) stays. Kit up/down on `/lists/unlisted`. `decideReorderOpenTasks` with `listId: null`.
- Story 7 “Order tasks in a list”: a member can see the open tasks on a named list in an order and change that order. Open order is among open tasks only. Completing drops a task out of that sequence but keeps `listId` and the remembered index. Uncomplete puts it back at that index (clamp to the end if the list got shorter). New tasks on a list, moves onto a list, and take-off onto unlisted all append to the end of that pile’s open tasks. Pin is unchanged. Story 8 (unlisted-pile reorder UI) stays out. Complete and uncomplete are now write sandwiches (`decideCompleteTask` / `decideUncompleteTask` → persist → apply); pin/delete stay on `TaskService`. Kit up/down buttons on the list’s open tasks (not drag-and-drop, not `window.confirm`). Existing open-on-list rows without an index get a stable `createdAt` order.
- Story 6 “Delete an empty named list”: a member can delete a named list that has no **open** tasks. Completed-on-list do not block. On success, those completed tasks are unlisted in the same command (they stay in Done; recreating the name is a new bucket). Hard-delete the list row. Names stay unique in the org; after delete the name is free. Humans (session) and agent tokens both can. Delete is a write sandwich (`decideDeleteNamedList` → persist → apply). Persist of `NamedListDeleted` nulls completed tasks’ `listId` then removes the list. Kit dialog on the Lists page (not `window.confirm`). Order, notes canvas, take-off stay out.
- Story 5 “Take a task off a list”: take an existing **open** task off a named list (one bucket → unlisted). Already-unlisted is a no-op. Completed stays put so uncomplete still restores the same list. PATCH `/api/tasks/:id` with `listId: null` extends the existing update sandwich (`decideUpdateTask` → persist → apply). Humans and agent tokens both can. Kit Select on task edit can clear to “No list”; disabled when completed (same as add). Delete list, order, notes canvas stay out.
- Story 4 “Add a new task to a list directly”: create a new task already on a named list (one bucket). You do not have to create unlisted then add. Same-org lists only; unknown or other-org lists are rejected. New tasks are open. Humans (session) and agent tokens both can. `POST /api/tasks` with optional `listId` is a write sandwich (`decideCreateTask` → persist → apply), same shape as PATCH — not a big-bang of complete/pin/delete. Quick-add reuses the kit Select from story 3. Take-off, delete list, order, and notes canvas stay out. Completing still keeps `listId`.
- Story 3 “Add an existing task to a list”: put an existing **open** task onto a named list (one bucket). A→B is a move; same list again is a no-op; completed tasks cannot be added or moved (Done must not change which list uncomplete would restore). PATCH `/api/tasks/:id` with `listId` is a write sandwich (`decideUpdateTask` → persist → apply). Humans and agent tokens both can. Unknown or other-org lists are rejected. Take-off and create-already-on-a-list stay out. Task edit uses the kit Select, same bar as assignee — no native `<select>`, no dedicated remove control; picker is disabled when the task is completed.
- Story 2 “Create a new named list”: any org member (human session or agent token) can name a new list. Names are unique in the org after trim, case-insensitive. It then shows in the existing org-wide Lists view, including when empty. Create is a write sandwich (`decideCreateNamedList` → persist → apply). The test-only `POST /api/test/named-lists` fixture is gone. Tasks are untouched.
- Story 1 “View my named lists”: members (session or agent token) can see this org’s named lists, including when there are none. No rename/delete UI. Tasks are untouched.

- Task edit assignee picker uses the shadcn New York Select from `@yoink/ui-base` (Radix), same kit as other form controls and menus. Assign to an agent, assign to yourself, or clear — behavior unchanged.
- Captures module reshaped as an I/O sandwich: `domain/` is types + pure `decide_*` + `apply`; `application/` is command/query handlers; HTTP and persist live in `infrastructure/`. `CaptureService` removed. Processing still uses `CaptureStore`. Judge the pilot before copying this shape to access or Phase 9.
- File-database parent-dir creation lives in `createDatabase`, not `index.ts` / `migrate.ts`.

For detailed history of completed phases, see [PLAN_ARCHIVE.md](./completed/PLAN_ARCHIVE.md).

---

## Phase 7: Authentication Overhaul

**Goal**: Replace API token UX with passkeys for proper user authentication before public release

See [PASSKEY_AUTHENTICATION.md](./design/PASSKEY_AUTHENTICATION.md) for detailed implementation plan.

**Key Design Decisions:**
- Passkeys replace token-copy-paste flow for web app users
- API tokens remain for machine-to-machine auth (extension, CLI)
- Invitation-only signup (no open registration)
- Every user has a personal org (named after their email, cannot leave)
- Users can be members of multiple organizations
- Admin panel becomes internal super-admin tooling (unchanged)

### 7.0 Test Infrastructure - Complete ✓

Playwright driver updated to support new auth flow while maintaining backward compatibility with token auth.

- [x] Playwright driver: Add CDP virtual authenticator setup
- [x] HTTP driver: Continue using API tokens (no changes needed)
- [x] Page objects for login, signup, and passkey management
- [x] Virtual authenticator teardown in driver cleanup

**PR #11 Fixes** (pending merge):
- [x] Fix `invited_by_user_id` nullable for admin-created invitations (migration 017)
- [x] Fix WebAuthn challenge verification for CDP Virtual Authenticator encoding differences
- [x] Add `COOKIE_SECURE` env var for HTTP-based E2E testing
- [x] Use `combinedAuthMiddleware` for all authenticated routes when WebAuthn is enabled
- [x] Update share page to support session-based auth
- [x] Create isolated browser context per actor for cookie isolation
- [x] Add `CookieConfig` to configuration system with proper validation
- [x] Add tests for `skipPermissionCheck` and null `invitedByUserId` scenarios

### 7.1 Database Schema (Backwards Compatible) - Complete ✓
- [x] Migration 012: Create `organization_memberships` table
- [x] Migration 013: Create `invitations` table
- [x] Migration 014: Create `passkey_credentials` table
- [x] Migration 015: Create `user_sessions` table
- [x] Migration 016: Make `users.email` globally unique (table rebuild)
- [x] `OrganizationMembership` domain type and `OrganizationMembershipStore` interface
- [x] `createSqliteOrganizationMembershipStore` adapter (10 tests)
- [x] `createFakeOrganizationMembershipStore` for unit tests
- [x] Updated seed script to create membership when seeding user
- [x] Keep `users.organization_id` for backwards compatibility (remove in 7.10)

### 7.2 Membership Model - Complete ✓
- [x] `OrganizationMembershipStore` interface and SQLite adapter (including `findById` method)
- [x] `MembershipService` with membership management (addMember, removeMember, changeRole, hasRole)
- [x] Domain error types for membership operations (AlreadyMember, CannotLeavePersonalOrg, LastAdmin, etc.)
- [x] Role hierarchy enforcement: `owner` > `admin` > `member`
- [x] 26 unit tests for MembershipService behavior
- [ ] Update queries to use memberships instead of `users.organization_id` (deferred to 7.10)

### 7.3 Passkey Service - Complete ✓
- [x] Install `@simplewebauthn/server` and `@simplewebauthn/browser`
- [x] `PasskeyCredentialStore` interface and SQLite adapter (13 tests)
- [x] `PasskeyService` with registration and authentication ceremonies (15 tests)
- [x] Stateless challenge management (HMAC-signed, 5-minute TTL) (13 tests)
- [x] Unit tests with mocked WebAuthn responses
- [x] Added `WebAuthnConfigSchema` to config schema

### 7.4 Session Management - Complete ✓
- [x] `UserSessionStore` interface and SQLite adapter (15 tests)
- [x] `SessionService` for create/validate/refresh/revoke (18 tests)
- [x] Session middleware (cookie-based, 7-day expiry with refresh) (6 tests)
- [x] Auth context includes `userId`, `currentOrganizationId`

**Follow-up items (deferred):**
- Session limit per user (e.g., max 10 active sessions) to prevent abuse/bloat
- Scheduled cleanup job for expired sessions (cron or startup task)
- Session regeneration after authentication (session fixation protection)

### 7.5 Invitation System - Complete ✓
- [x] `Invitation` entity type with code, email restriction, expiry, acceptance tracking
- [x] `InvitationStore` interface and SQLite adapter (13 tests)
- [x] `createFakeInvitationStore` for unit tests
- [x] `InvitationService` for create/validate/accept/listPending (18 tests)
- [x] `CodeGenerator` infrastructure utility for generating invitation codes
- [x] API contract with endpoints: create, validate, accept, listPending
- [x] Invitation routes (validate is public, others require auth)
- [x] Wire up invitation routes in `composition-root.ts` and `app.ts`
- [x] Signup flow: creates user, personal org, membership, passkey, session (12 tests)

**Implementation Notes:**
- Invitation codes are 8 alphanumeric characters (excludes ambiguous chars I, O, 0, 1)
- Default expiry is 7 days
- Optional email restriction: invitation can only be used by specific email
- Role assignment: invitations specify `admin` or `member` role
- Validate endpoint is public (no auth) to allow checking before signup
- Accept endpoint creates membership and marks invitation as used
- Signup endpoints: `POST /api/auth/signup/options` and `POST /api/auth/signup/verify`
- Signup creates: user, personal organization, personal org membership (owner), invited org membership, passkey credential, session
- Session cookie set on successful signup with 7-day expiry

### 7.6 Auth API Endpoints

**System Invariant**: Humans must always have at least 1 passkey. This is enforced by preventing deletion of the last passkey. Agents are token-only principals and cannot register passkeys.

#### 7.6a Passkey Registration for Existing Users (Migration Path) - Complete ✓
**Goal**: Allow token-authenticated users to add passkeys and transition to session auth.

This is the **migration path** for existing users who currently authenticate via API token. After registering a passkey, they immediately switch to session-based auth.

- [x] `POST /api/auth/signup/options` and `/verify` (passkey registration during signup)
- [x] Session cookie security: `httpOnly`, `secure`, `sameSite: strict`
- [x] Create combined auth middleware (accepts token OR session cookie, session preferred)
- [x] `POST /api/auth/passkey/register/options` - Get WebAuthn registration options (requires auth)
- [x] `POST /api/auth/passkey/register/verify` - Verify passkey, save credential, create session (requires auth)
- [x] `GET /api/auth/passkey/credentials` - List user's passkeys (requires auth)
- [x] `DELETE /api/auth/passkey/credentials/:id` - Delete passkey with "can't delete last" guard
- [x] API contract: `passkey-contract.ts` with request/response schemas
- [x] Unit tests for combined auth middleware (8 tests)
- [x] Unit tests for passkey routes (12 tests)
- [x] Acceptance tests: `passkey-management.test.ts` (5 tests, HTTP driver only)
- [x] `deleteCredentialForUser` method with ownership validation (4 tests)
- [x] `CannotDeleteLastPasskeyError` and `CredentialOwnershipError` error types
- [x] DSL extended with `registerPasskey`, `listPasskeys`, `deletePasskey` operations
- [x] WebAuthn config loading from environment variables

**Behavior on `/register/verify` success**:
1. Verify WebAuthn registration response
2. Save passkey credential to database
3. Create user session
4. Set session cookie (`httpOnly`, `secure`, `sameSite: strict`)
5. Return credential info (id, name, createdAt)

**Web app can clear localStorage token after success** - user is now session-authenticated.

#### 7.6b Passkey Login (New Auth Flow) - Complete ✓
**Goal**: Allow users to log in with passkey (no token needed).

- [x] `POST /api/auth/login/options` - Get WebAuthn authentication options (public, no auth required)
- [x] `POST /api/auth/login/verify` - Verify passkey, create session, set cookie (public)
- [x] `POST /api/auth/logout` - Revoke current session (requires auth)
- [x] `GET /api/auth/session` - Get current session info (requires auth)
- [x] API contract: `auth-contract.ts` for login/logout/session endpoints
- [x] Unit tests for login routes (12 tests)
- [x] Acceptance tests: `authenticating-with-passkeys.test.ts` (5 tests, HTTP driver only)

**Implementation Notes:**
- Login uses discoverable credentials (empty `allowCredentials`) - no email required
- User selects passkey on device, credential ID identifies the user
- Session cookie set on successful login with 7-day expiry
- Logout clears cookie and revokes session from database
- Session info endpoint returns minimal user data and current organization

#### 7.6c Rate Limiting & Security - Complete ✓
- [x] Rate limiting on login endpoints (brute force protection)
- [x] Rate limiting on passkey registration (abuse prevention)

**Implementation Notes:**
- Auth login endpoints (`/api/auth/login/*`): 10 requests per 15 minutes per IP
- Signup endpoints (`/api/auth/signup/*`): 5 requests per hour per IP
- Configurable via environment variables: `RATE_LIMIT_AUTH_LOGIN_MAX`, `RATE_LIMIT_AUTH_LOGIN_WINDOW`, `RATE_LIMIT_SIGNUP_MAX`, `RATE_LIMIT_SIGNUP_WINDOW`
- Rate limiting is disabled when `RATE_LIMIT_ENABLED=false` (for testing)

### 7.7 Web App Auth Overhaul

Split into deployment-friendly chunks to enable zero-downtime migration:

#### 7.7a Settings Passkey Management (Deploy First) - Complete ✓
**Prerequisite**: 7.6a complete

This allows existing token-authenticated users to add passkeys without changing the main auth flow.

- [x] Install `@simplewebauthn/browser` dependency (already installed)
- [x] Add "Security" section to Settings page
- [x] "Add Passkey" button and registration flow
- [x] Device name input with suggested default (based on user agent)
- [x] Passkey list component (name, created date, last used, sync status)
- [x] Delete passkey with confirmation dialog
- [x] Disable delete button for last passkey (with tooltip)
- [x] On passkey registration success: clear localStorage token
- [x] Inline error display for registration failures

**Implementation Notes:**
- `apps/web/src/api/passkey.ts` - Passkey API client with registration flow
- `apps/web/src/components/security-section.tsx` - Security UI components
- Device name suggestion parses user agent for browser/platform

#### 7.7b Login & Signup Pages (Deploy Second) - Complete ✓
**Prerequisite**: 7.6b complete

- [x] Create `/login` page with "Sign in with Passkey" button
- [x] Create `/signup` page with invitation code input + passkey registration
- [x] Update root route guard: check for token OR session, redirect to `/login` if neither
- [x] Handle 401 errors: redirect to `/login` with return URL
- [x] Update logout to call API and redirect to `/login`

**Implementation Notes:**
- `apps/web/src/api/auth.ts` - Auth API client (login, logout, signup, session check)
- `apps/web/src/routes/login.tsx` - Passkey login page
- `apps/web/src/routes/signup.tsx` - Multi-step signup (code validation → email/passkey)
- `apps/web/src/routes/_authenticated.tsx` - Route guard checks both token and session
- `apps/web/src/api/client.ts` - 401 handling redirects to /login, includes credentials
- Signup supports `?code=` query param for direct invitation links
- Login supports `?returnTo=` query param for post-login redirect

#### 7.7c Remove Token Auth from Web App (Deploy Third) - Partial ✓
**Prerequisite**: 7.7a and 7.7b complete, existing users have migrated to passkeys

- [x] Remove `/config` page entirely
- [ ] Remove `tokenStorage` utility from codebase *(kept for backwards compatibility)*
- [ ] Update API client to rely on session cookies only *(token fallback kept)*
- [x] Update error handling: 401 → redirect to `/login`
- [ ] Clean up any remaining token-related code *(deferred)*

**Current State (Backwards Compatible):**
The web app now prefers session-based auth but falls back to token auth for existing users who haven't yet registered passkeys. This allows zero-downtime migration.

**Files Modified:**
- Deleted `apps/web/src/routes/config.tsx`
- Updated `apps/web/src/lib/token.ts` - Simplified, marked for removal
- Updated `apps/web/src/api/client.ts` - Session preferred, token fallback
- Updated `apps/web/src/api/passkey.ts` - Token fallback for registration
- Updated `apps/web/src/routes/_authenticated.tsx` - Session preferred, token fallback
- Updated `apps/web/src/routes/share.tsx` - Session preferred, token fallback

**Token Removal Criteria:**
Remove token auth from the web app when ALL of the following are true:
1. All existing users have registered at least one passkey
2. Users have confirmed they can log in successfully with passkeys
3. No users are relying on token auth for web app access

To complete token removal, delete/update these files:
- `apps/web/src/lib/token.ts` - Delete entirely
- `apps/web/src/api/client.ts` - Remove token fallback in `createApi()`
- `apps/web/src/api/passkey.ts` - Remove `getAuthHeaders()` and `tokenStorage` usage
- `apps/web/src/routes/_authenticated.tsx` - Remove `tokenStorage.isConfigured()` check
- `apps/web/src/routes/share.tsx` - Remove `tokenStorage.isConfigured()` check

**Note**: API tokens remain valid for extension/CLI use. Only the web app will stop accepting token auth.

### 7.8 Settings & Organization Management - Complete ✓

**Story 1: Switch Organization** (pig icon dropdown in header) - Complete ✓
- [x] API contract: `organization-contract.ts` with switch/leave endpoint schemas
- [x] Extend `GET /api/auth/session` to return `organizations` array (id, name, isPersonal, role)
- [x] Fix acceptance test DSL: `createToken`/`listTokens` now require `organizationId` parameter
- [x] Implement `POST /api/organizations/switch` endpoint handler
- [x] Create `OrganizationSwitcher` dropdown component (shows org name, dropdown with all orgs)
- [x] Update Header to use OrganizationSwitcher
- [x] On switch: reload page to refresh data for new org context

**Story 2: Leave Organization** (in Settings page) - Complete ✓
- [x] Implement `POST /api/organizations/:id/leave` endpoint handler
- [x] Add "Organizations" card to Settings page listing memberships
- [x] Show "Personal" badge for personal organizations
- [x] "Leave" button with confirmation dialog (disabled for personal orgs)
- [x] Guards: cannot leave personal org, cannot leave as last admin
- [x] Acceptance tests: `switching-organizations.test.ts`, `leaving-organizations.test.ts`

**Implementation Notes:**
- Session response now includes full org list for switcher dropdown
- `SessionService.switchOrganization()` already exists in backend
- `MembershipService.removeMember()` already has leave guards
- Frontend auto-switches to personal org when leaving current org
- DSL extended with `switchOrganization`, `leaveOrganization`, and updated `getSessionInfo`

### 7.9 Org Admin Features in Web App - Complete ✓
- [x] Members list page
- [x] Create invitation UI
- [x] Remove member
- [x] View pending invitations

**Implementation Notes:**
- `apps/web/src/routes/_authenticated/settings/members.tsx` - Members list with role badges
- `apps/web/src/routes/_authenticated/settings/invitations.tsx` - Pending invitations list with revoke
- `apps/web/src/components/create-invitation-dialog.tsx` - Invitation creation with role/email options
- `apps/web/src/components/remove-member-dialog.tsx` - Member removal with confirmation
- Role hierarchy enforced: owners can remove admins, admins can remove members, nobody can remove owners
- Permission badges: Owner, Admin, Member displayed in members list
- Acceptance tests: `managing-invitations.test.ts` (6 tests), `managing-members.test.ts` (4 tests)

### 7.10 Cleanup - Complete ✓
- [x] Migration: Remove `users.organization_id` column (Migration 020)
- [x] Update queries to use memberships table exclusively
- [x] Update documentation

**Implementation Notes:**
- Migration 020 uses `rebuildTable` utility to remove the column
- User domain types and stores no longer reference `organizationId`
- Auth context uses memberships + sessions for organization context

### 7.11 User Token Self-Service - Complete ✓
- [x] Token list in settings (Organization tab)
- [x] Create/revoke tokens for extension/CLI use
- [x] Maximum 2 tokens per user per organization

**Implementation Notes:**
- `POST /api/auth/tokens` - Create token (returns raw token once)
- `GET /api/auth/tokens` - List tokens for current user/org
- `DELETE /api/auth/tokens/:id` - Revoke token (ownership validated)
- UI in Settings > Organization tab > API Tokens section
- Acceptance tests: `managing-tokens.test.ts` (9 tests)

### Deployment Strategy (Zero-Downtime Migration)

This ordering allows incremental deployment without breaking existing users:

| Step | Deploy | User Experience |
|------|--------|-----------------|
| 1 | 7.6a (passkey registration endpoints) | No visible change yet |
| 2 | 7.7a (Settings passkey UI) | Users can add passkeys while still using token auth |
| 3 | **Migration window** | Prompt existing users to add passkeys |
| 4 | 7.6b (login endpoints) | No visible change yet |
| 5 | 7.7b (login/signup pages) | New auth flow available, both flows work |
| 6 | 7.7c (remove token auth from web) | Token auth removed from web app |

**For single-user scenario**: Deploy steps 1-2, add passkey in Settings, then deploy steps 3-6.

**For multi-user scenario**: After step 2, show in-app banner prompting users to add passkeys before step 6.

**Note**: API tokens remain valid for extension/CLI after step 6. Only the web app stops accepting token auth.

**Deliverable**: Users sign up via invitation, log in with passkeys, can belong to multiple orgs

---

## Phase 8.5: Architecture Cleanup

**Goal**: Establish proper modular monolith architecture before adding new entities

See [MODULAR_MONOLITH.md](./architecture/MODULAR_MONOLITH.md) for detailed design document.

**Why Now?**
Adding folders and notes on top of current architecture would compound existing boundary violations. Cleaning up now creates a solid foundation for Phase 9 and beyond.

### 8.5.1 ESLint Setup (Foundation) - Complete ✓
- [x] Install `eslint` and `eslint-plugin-boundaries`
- [x] Create `apps/api/eslint.config.js` with element definitions
- [x] Configure permissive rules (warn, not error) to establish baseline
- [x] Run ESLint and document current violations
- [x] Add `lint` script to package.json

Baseline documented in `docs/architecture/ESLINT_BASELINE.md`.

**Linting Warning Baseline (Current)**
- `boundaries/no-unknown` (warn): imports span legacy module layout, migrations, and tests. Resolve during 8.5.2–8.5.4 after module consolidation and index cleanup.
- `boundaries/element-types` (warn): permissive until service boundaries are fixed. Tighten and promote to error in 8.5.5.
- `react-hooks/exhaustive-deps` (warn): legacy hook patterns in web/admin UI. Fix during 8.5.4 or before Phase 9 UI work.
- `react-hooks/set-state-in-effect` (warn): state initialization in effects. Refactor to event-driven or derived state during 8.5.4 or before Phase 9 UI work.
- `@typescript-eslint/no-explicit-any` (warn): legacy typing gaps, mostly in API auth tests. Replace with proper types during 8.5.2–8.5.4.
- `no-undef`/`no-redeclare` disabled in base config because TypeScript handles these; no action planned.

**Deliverable:** ESLint configured, baseline violations documented

### 8.5.2 Module Consolidation - Complete ✓ (revised: bounded contexts)

**Design revision**: Before implementation, the planned `identity/` + `organizations/` split was cross-referenced against Nygard's entity-service antipattern and services-by-lifecycle essays. Conclusion: the split still cut through real cohesion (invitation → membership → organization → user is one lifecycle), so top-level modules are now **DDD bounded contexts**. See the 2026-07-29 addendum in `docs/architecture/MODULAR_MONOLITH.md`.

- [x] Composition tests first as safety net: `apps/api/src/tests/composition/` (17 tests)
- [x] Create `access/` ("Administration and Access" context) with domain/infrastructure/application layers
- [x] Move `auth/`, `users/`, `organizations/`, `invitations/`, **and `admin/`** into `access/` (git mv, history preserved)
- [x] Delete dead re-export barrels (`auth/domain/index.ts` et al. — verified imported by nothing)
- [x] Dedupe `userNotFoundError` (was defined in both user-errors and organization-errors)
- [x] Update all import paths (~70 files); filenames and symbols unchanged
- [x] ESLint: single `access` element replaces auth/users/organizations/invitations/admin
- [x] Fix boundaries resolver (`eslint-import-resolver-typescript`): old 524-warning baseline was resolver noise; real picture is 15 cross-context warnings (see `ESLINT_BASELINE.md`)
- [x] `pnpm quality` + `pnpm e2e:test` green (199 acceptance tests unchanged)

**Deliverable:** Consolidated bounded-context structure ✓

### 8.5.3 Clean Up Re-exports - Complete ✓
- [x] Curated `index.ts` per layer in `access/` (explicit named exports, no `export *`): domain (service factories/types, domain types, error unions), infrastructure (store factories, fakes, seed), application (middleware, route registration)
- [x] `app.ts` and `composition-root.ts` import via the three barrels
- [x] `captures`/`tasks` route files import `AuthMiddleware` from `access/application/index.js`
- [x] Store interfaces and error factories deliberately NOT exported from indexes
- [x] Known cross-context debt tagged `TODO(8.5.4)`: `health` → `access/domain/token-store.js`; `app.ts` → `access/domain/organization-store.js`
- [x] Deleted dead `processing/domain/index.ts`

**Deliverable:** Clean entry points with no re-exports ✓

### 8.5.4 Fix Service Boundary Violations - Scope Reduced
Most violations listed in MODULAR_MONOLITH.md dissolved with the bounded-context consolidation (intra-context store access is legitimate). Remaining:
- [ ] `health` → `access` TokenStore deep import: depend on an access service or narrower port
- [ ] `app.ts` → OrganizationStore deep import: auth-routes should take a service dependency
- [ ] Merge duplicated error factories in `access/domain/admin-errors.ts` (userNotFoundError, organizationNotFoundError, tokenNotFoundError duplicate user/org/auth errors)
- [ ] Review the invitation↔membership seam inside `access/` (one lifecycle; consider a signup/joining workflow module per MODULAR_MONOLITH §2.2's `workflows/` sketch)

**Deliverable:** No cross-context store imports

### 8.5.5 Enforce Boundaries - Not Started
- [ ] Decide type-only allowances for cross-context imports (captures/tasks/health → access)
- [ ] Change ESLint rules from warn to error
- [ ] Enable entry-point restrictions (index.ts-only for cross-context imports)
- [ ] Fix any remaining violations
- [ ] Add ESLint to CI pipeline
- [ ] Document module contracts

**Deliverable:** Strict boundary enforcement in CI

### 8.5.6 Aggregate Persistence - Not Started
- [ ] Create `UserIdentityStore` for atomic user+org+membership creation
- [ ] Refactor `SignupService` to use `UserIdentityStore`
- [ ] Test atomic behavior with `db.batch()`
- [ ] Document `db.batch()` patterns

**Deliverable:** Atomic aggregate persistence for signup

---

## Identity slice: Agent principals - Complete ✓

**Goal**: Let the bot team sit on the task board as first-class org members, without punching the human passkey invariant.

**Product rules (locked):**
- Agents are token-only principals: org members that cannot passkey. Humans always have ≥1 passkey.
- An org owner/admin can mint an agent member and receives its API token once. That token is the agent's — it does not consume a human's 2-token-per-user-per-org bucket.
- Tasks have an `assigneeId` field (a principal id: human or agent). Set/clear on create/update. Shown on the task row. This is a field, not an assignment product (no notifications, no assignment inbox, no extra UX workflow).
- Captures stay human: agent tokens cannot create captures. Agents are task-side only (create/list/get/update/complete/pin/delete, including assignee).
- Any principal may assign to any other principal in the org.

**Out of scope (intentionally not done):**
- Deleting the existing vault-assistant token (ops, not this slice)
- Notes, folders, desktop canvas, Tadori
- Changing capture triage, share target, or extension capture besides rejecting agent capture
- Removing web token fallback (7.7c)
- Phase 9

**Design:**
- `users.kind` is `'human' | 'agent'` (default human). Agents have a display `name` and a reserved unique email (`agent-{id}@yoink.invalid`) so the existing uniqueness constraint stays.
- Agents get an org membership (`member`, not a personal org) and one API token minted onto the agent user — not the caller's token list.
- Passkey registration rejects `kind === 'agent'`. Last-passkey deletion remains a human invariant.
- Auth context carries `principalKind`. Capture create returns 403 for agents.
- Tasks validate `assigneeId` against org membership via a narrow `OrgPrincipalLookup` port (no access-store import from tasks).

- [x] Migration 021: `users.kind`, `users.name`
- [x] Migration 022: `tasks.assignee_id`
- [x] `AgentService.mintAgent` (owner/admin only)
- [x] `POST /api/organizations/:organizationId/agents` (token or session)
- [x] Task `assigneeId` on create/update/list; shown on the task row
- [x] Agent tokens rejected on capture create
- [x] Agents cannot register passkeys
- [x] Acceptance tests: `agent-identity.test.ts` (HTTP; isolated HTTP actors are admins so they can mint)
- [x] Mint-agent UI on members settings; assignee field on task edit
- [x] Playwright board coverage: assigned row shows the assignee name; edit picker can set an agent, set the current human, and clear — row updates each time
- [x] Assignee picker on task edit uses kit Select (Unassigned + members), aligned with other form controls and menus — not a native `<select>`

**Deliverable:** Bot team members can be minted, hold their own token, and appear as task assignees. Human passkey signup/login is unchanged.

### Agent member roster (follow-up) - Complete ✓

Agents sit on the task board but could not list org members, so they could not pick an assignee. The contract already said any member can view the roster (token or session); the handler only read the session cookie and blocked token auth.

**Product rules (locked):**
- Agent tokens can `GET /api/organizations/:organizationId/members` for orgs they belong to
- The list includes humans and agents — enough to pick an assignee
- Agents still cannot mint other agents, remove members, or bulk-mint
- Agents still cannot create captures
- Folders, captures (beyond the existing reject), and token deletion are untouched

- [x] `listMembers` uses `request.authContext` (token or session), not session-only
- [x] HTTP driver implements `listMembers`; it is a core actor operation
- [x] HTTP acceptance: minted agent lists itself and the minting human
- [x] HTTP acceptance: agent still cannot mint an agent
- [x] HTTP acceptance: agent still cannot create captures
- [x] Route tests: agent token lists members; 403 when not a member; cannot mint or remove

**Deliverable:** An agent member can list the org roster and still cannot administer membership or capture.

### Mine / assigned-to-me list (follow-up) - Complete ✓

UAT work assigned to Justin was buried in the org-wide grocery list. Assignee is already a field; this slice is only a list view for the current principal.

**Product rules (locked):**
- `GET /api/tasks?filter=mine` lists incomplete tasks assigned to the authenticated caller (human or agent token)
- A task assigned to someone else does not appear
- An unassigned task does not appear
- Existing `today` / `upcoming` / `all` / `completed` filters are unchanged
- PWA Tasks page has a Mine tab (existing Tabs kit); assignee still shows on the row
- Quick-add on Mine assigns the new task to the current user so it stays on the view
- Folders, notes, bulk-mint, capture, and design-system work stay parked

**Design:** Dedicated `mine` value on the existing `filter` query (not a second query param, not combined with date views). Caller id comes from auth context. No new module.

- [x] `TaskFilterSchema` includes `mine`
- [x] Store + service filter by `assignee_id = caller` and incomplete
- [x] HTTP acceptance: assigned-to-me appears; assigned-to-other and unassigned do not; date/completed filters still work
- [x] HTTP acceptance: agent token lists only tasks assigned to the agent
- [x] PWA Mine tab; Playwright: Mine shows assigned-to-me and hides the rest

**Deliverable:** The caller can list their assigned tasks without scrolling the org grocery list.

---

## Named lists: View my named lists - Complete ✓

**Goal**: A member can open the board and see this organization’s named lists — or the empty lists view if there are none.

**Product rules (locked):**
- A list is an optional single bucket on a task (one list or none). This story does not put tasks on lists.
- “My named lists” = every named list in the current organization, including empty ones. Not creator-private.
- View shipped before Create (story 2). Rename/delete stay out.
- Tasks stay untouched (no `listId` on tasks).

**Out of scope:**
- Add task to list, new task on a list, take off a list
- Delete / rename / order lists
- Notes canvas, folder archive, filter-the-board-by-list

**Implementation:**
- Migration 023: `lists` table (`id`, `organization_id`, `created_by_id`, `name`, `created_at`)
- `NamedListSchema` + `GET /api/lists`
- `lists/` I/O sandwich: query handler loads and returns (no fake events)
- Lists view on the authenticated board (`/lists`) with empty state
- HTTP + Playwright acceptance: empty org shows the view; names appear; agents can view; orgs are isolated

**Deliverable:** A member can open the board and see named lists (or the empty view).

---

## Named lists: Create a new named list - Complete ✓

**Goal**: A member (including an agent) can create a named list. After create, it appears in the existing Lists view.

**Product rules (locked):**
- Any org member may create a list, agents included. Humans (session) and agent tokens (Bearer) both create. Do not restrict to owner.
- After create, the new list appears in the existing Lists view (org-wide, including empty).
- Name is required, 1–200 characters (matches `NamedListSchema`). Names are unique in the organization after trim, case-insensitive (`Groceries` and `groceries` are the same name). A duplicate is rejected; an empty name after trim is still rejected.
- This is not tags. A list is an optional single bucket on a task — this story does not put tasks on lists.
- Who may create is locked: any member including agents.

**Out of scope:**
- Add existing task to a list, add a new task to a list, take a task off a list
- Delete a list, order, notes canvas, rename
- Tasks stay untouched (no `listId`, no task sandwich)

**Implementation:**
- `POST /api/lists` with `CreateNamedListSchema` (`name` 1–200, trimmed)
- `lists/` write sandwich: HTTP maps body+auth → `CreateNamedListCommand`; handler loads current org names; `decideCreateNamedList` emits `NamedListCreated`, `INVALID_LIST_NAME`, or `DUPLICATE_LIST_NAME`; persist; `applyNamedListEvent` projects
- Unique index `idx_lists_org_name_ci` on `(organization_id, lower(name))` (expand; existing org+name index stays)
- Queries still list; no fake events on the read path
- Product write path replaces `POST /api/test/named-lists`. `ENABLE_TEST_FIXTURES` removed (nothing else needed the seed)
- Lists page: shadcn New York “New list” dialog (`@yoink/ui-base`)
- HTTP + Playwright acceptance: human creates, agent token creates, empty name rejected, duplicate name (any casing) rejected, different names still work, new list shows in the view, unauthenticated cannot create

**Deliverable:** A member (including an agent) can create a named list in the PWA and via API.

---

## Named lists: Add an existing task to a list - Complete ✓

**Goal**: A member can put an existing open task onto a named list. Afterward it shows as on that list.

**Product rules (locked):**
- A list is an optional single bucket: a task has one list or none, not tags.
- Putting a task that is on list A onto list B is a **move**, not a second membership.
- Putting it on the same list again is a no-op (no error).
- Only **open** tasks may be added to a list. Reject adding (or moving) a completed task. Completing keeps `listId` on the field; we do not let Done quietly change which list an uncomplete will restore to.
- Take-off (clear to unlisted) is story 5. No dedicated remove control.
- Kit picker (shadcn New York Select from `@yoink/ui-base`), same bar as the assignee Select — no native `<select>`.
- Humans (session) and agent tokens can both set the list, same as other task updates.
- Org-scoped: only lists in the same org. Invalid/unknown list rejected.

**Out of scope:**
- Create a new task already on a list (story 4)
- Take a task off a list (story 5)
- Delete list, order, notes canvas, create list (already shipped)

**Implementation:**
- Migration 025: nullable `tasks.list_id` (+ index)
- `TaskSchema.listId` optional; `UpdateTaskSchema.listId` uuid (not nullable — clearing is story 5). Create stays without `listId`.
- Task PATCH is a write sandwich: HTTP maps body+auth → `UpdateTaskCommand`; handler loads the task and (if `listId` is a change) the list; `decideUpdateTask` emits `TaskUpdated`, `Noop` (same list again), `LIST_NOT_IN_ORGANIZATION`, or `TASK_NOT_OPEN` (completed); persist; `applyTaskEvent` projects. Create/complete/pin/delete stay on `TaskService`.
- Narrow `LoadNamedList` port so tasks do not import the lists store.
- Task edit modal: kit Select of org lists (placeholder “No list”, no Unlisted item; disabled when the task is completed). Task row shows the list name.
- HTTP + Playwright acceptance: pick a list for an existing unlisted task; it then belongs to that list; kit picker; unauthenticated cannot; cannot put a task on another org’s list; agents can; unknown list rejected; A→B is a move; same list is a no-op; completed cannot be added or moved.

**Deliverable:** A member can put an existing task on a named list in the PWA and via API.

---

## Named lists: Add a new task to a list directly - Complete ✓

**Goal**: A member can create a new task already on a named list. After create it shows on that list.

**Product rules (locked):**
- A list is an optional single bucket: a task has one list or none, not tags.
- This story creates a new task already on a named list. You do not have to create unlisted then add.
- Same-org lists only. Unknown or other-org lists are rejected (`LIST_NOT_IN_ORGANIZATION`, same as update).
- New tasks are open by definition (they are not completed).
- Humans (session) and agent tokens can both do this.
- Kit UI (shadcn New York Select from `@yoink/ui-base`). Quick-add reuses the list Select from story 3 — no native `<select>`.
- Completing still keeps `listId`. Complete behavior is unchanged except as needed to keep the association.

**Out of scope:**
- Take-off / unlisted (story 5). Delete list is blocked until take-off is real.
- Delete list, order, notes canvas.

**Implementation:**
- `CreateTaskSchema.listId` optional uuid (not nullable — clearing is story 5)
- Task create is a write sandwich: HTTP maps body+auth → `CreateTaskCommand`; handler loads the list when `listId` is set; `decideCreateTask` emits `TaskCreated` or `LIST_NOT_IN_ORGANIZATION` / `ASSIGNEE_NOT_IN_ORGANIZATION`; persist; `applyTaskEvent` projects. Complete/pin/delete stay on `TaskService`.
- Tasks page quick-add: kit Select of org lists (including “No list”). Optimistic create includes `listId`.
- HTTP + Playwright acceptance: create a task with a list and see it on that list; create without a list still works (unlisted); agent can; unauthenticated cannot; other-org list rejected; unknown list rejected.

**Deliverable:** A member can create a new task already on a named list in the PWA and via API.

---

## Named lists: Take a task off a list - Complete ✓

**Goal**: A member can take an open task off a named list. Afterward it is unlisted.

**Product rules (locked):**
- Same shape as add-existing: only **open** tasks may be taken off a list.
- Already-unlisted is a no-op (no error required).
- Completed stays put: you cannot take a completed task off a list, so uncomplete still restores the same list.
- One bucket: take-off means `listId` becomes none (unlisted). Not tags.
- Kit UI (shadcn New York Select from `@yoink/ui-base`): the existing list picker can clear to unlisted for open tasks; disabled when completed (same as add).
- Humans (session) and agent tokens can both take off.
- Delete list stays blocked until this is real. Do not implement delete list, order, notes canvas, create list.

**Out of scope:**
- Delete list, order, notes canvas, create list (already shipped)
- Complete/pin/delete sandwich (stay on `TaskService`)

**Implementation:**
- `UpdateTaskSchema.listId` uuid **nullable** (`null` clears). Create still omits `listId` for unlisted (null on create stays rejected).
- Task PATCH sandwich already exists: HTTP maps body+auth → `UpdateTaskCommand`; handler loads the task and (if `listId` is a uuid change) the list; `decideUpdateTask` emits `TaskUpdated` (`listId: null`), `Noop` (already unlisted), or `TASK_NOT_OPEN` (completed); persist; `applyTaskEvent` projects (delete `listId`).
- Task edit modal: kit Select includes “No list” so an open task can be cleared; still disabled when completed.
- HTTP + Playwright acceptance: open task on a list can be taken off and is then unlisted; already-unlisted is a no-op; completed on a list cannot be taken off (stored list stays); kit picker can clear; unauthenticated cannot; agents can.

**Deliverable:** A member can take an open task off a named list in the PWA and via API.

---

## Named lists: Delete an empty named list - Complete ✓

**Goal**: A member can delete a named list that has no open tasks. Afterward it is gone from the Lists view, and its name can be reused.

**Product rules (locked):**
- Refuse delete if any **open** task is still on the list.
- Completed-on-list do **not** block delete.
- An empty list (no open tasks) goes away.
- On successful delete, **clear** `listId` on those completed tasks in the same command. They stay in Done, unlisted. Recreating the name later is a new bucket; old completed tasks do not jump onto it.
- Soft-delete / keep history is a later story. Hard-delete the list row.
- Unique-in-org names stay. After delete, the name is free again.
- Humans (session) and agent tokens can both delete (same as create: any member).
- Kit UI on the Lists page. No native confirm — kit Dialog.

**Out of scope:**
- Order (stories 7–8), notes canvas, take-off (already shipped)
- Rename
- Soft-delete / list history

**Implementation:**
- `DELETE /api/lists/:id` — 204 on success; 409 if open tasks remain; 404 if missing/other-org; 401 unauthenticated
- `lists/` write sandwich: HTTP maps params+auth → `DeleteNamedListCommand`; handler loads the list and open-task count (narrow `CountOpenTasksOnList` port — tasks do not import the lists store); `decideDeleteNamedList` emits `NamedListDeleted`, `LIST_NOT_FOUND`, or `LIST_HAS_OPEN_TASKS`; persist; `applyNamedListEvent` projects away
- Persist of `NamedListDeleted`: narrow `ClearCompletedListIds` port unlists remaining completed (and already-deleted) tasks, then the list row is removed
- Lists page: kit Dialog confirm (shadcn New York from `@yoink/ui-base`)
- HTTP + Playwright acceptance: delete a list with no open tasks; refuse when an open task is on it; completed-only does not block; completed tasks are unlisted and stay in Done; name can be reused after delete and old completed do not join the new list; unauthenticated cannot; agents can

**Deliverable:** A member can delete a named list that has no open tasks in the PWA and via API.

---

## Named lists: Order tasks in a list - Complete ✓

**Goal**: A member can see the open tasks on a named list in an order, and change that order.

**Product rules (locked):**
- Open order is among **open** tasks only. Completed drop out of that sequence but keep `listId`.
- Land at the end: new task on a list, move onto a list, take-off onto unlisted — all append to the end of that pile’s open tasks.
- Uncomplete: put it back at its remembered open-order index (clamp to end if the list got shorter). Keep that index through complete; don’t clear it.
- Pin stays its own thing, not this order.
- Story 7 is order **within a list**. Story 8 applies the same rules to the unlisted pile.
- A list is still an optional single bucket, not tags. Anyone in the org (human or agent token) can reorder.

**Out of scope:**
- Notes canvas, tags, rename list, order the lists themselves, change pin
- Reordering All/Today/Mine/Upcoming by `openOrder` (those filters stay pin-then-created)
- Big-bang TaskService rewrite (pin/delete stay on TaskService)

**Implementation:**
- Migration 026: nullable `tasks.open_order` + backfill by `created_at` per pile (that `list_id`, or unlisted)
- `GET /api/lists/:id/tasks` — open tasks on that list in open order
- `PUT /api/lists/:id/tasks/order` — `{ taskIds }` permutation of current open-on-list
- Complete/uncomplete write sandwich; create/PATCH assign `openOrder` when joining a pile
- Lists page: open a named list; kit up/down on its open tasks

**Deliverable:** A member can see and change the open-task order on a named list in the PWA and via API.

---

## Named lists: Order unlisted tasks - Complete ✓

**Goal**: A member can see the open tasks that are not on a named list, in an order, and change that order.

**Product rules (locked):**
- Same rules as story 7, on the unlisted pile (`listId` none).
- Open order is among **open** unlisted tasks only. Completed drop out of that sequence but keep the remembered index (and stay unlisted).
- Land at the end: new task with no list, and take-off onto unlisted, append to the end of the unlisted pile’s open tasks.
- Uncomplete: put it back at its remembered open-order index (clamp to end if the unlisted open pile got shorter). Keep that index through complete; don’t clear it.
- Unlisted is its own open pile, not a global rank across All. The All view can keep showing everything; this order is only for tasks with no list.
- Do not reorder the All/Today/Mine/Upcoming filters by unlisted `openOrder`. Pin still sits on top of those filters (unchanged, not this order).
- A list is still an optional single bucket, not tags. Anyone in the org (human or agent token) can reorder.

**Out of scope:**
- Notes canvas, tags, rename, order the lists themselves, change pin
- Rebuild list-order UI (named-list kit up/down stays as shipped)
- Reordering All/Today/Mine/Upcoming

**Implementation:**
- Reuse `openOrder` and `decideReorderOpenTasks` with `listId: null` (not a fake list id)
- `GET /api/unlisted/tasks` — open unlisted tasks in open order
- `PUT /api/unlisted/tasks/order` — `{ taskIds }` permutation of current open-unlisted
- Lists page: Unlisted entry; kit up/down on `/lists/unlisted`
- Existing unlisted open rows without an index keep a stable `createdAt` order (`compareOpenOrder` / `NULLS LAST`)

**Deliverable:** A member can see and change the open-task order of the unlisted pile in the PWA and via API.

---

## All has two modes - Complete ✓

**Goal**: On the Tasks All view, a member can switch between (1) every pile at once, grouped by list, no reorder, and (2) one pile (a named list, or unlisted), where they can change that pile’s open order.

**Product rules (locked):**
- Lists is a dimension of the task board, not a second app. This story only changes **All**. Do not change Today, Upcoming, Mine, Done. Do not remove the Lists nav. Do not add create/delete list UI.
- All has two modes. Dropdown on All: **all lists** (grouped overview, including unlisted, no reorder) vs a **named list** vs **unlisted**.
- Reorder only in the one-pile modes. Overview cannot reorder.
- `openOrder` is one shared sequence per pile. Pin is its own stamp, not this order. Pin already floats on the All API sort (pinned_at then created_at); do not sort overview by openOrder.
- One-pile named list: `GET`/`PUT` `/api/lists/:id/tasks` (already shipped). One-pile unlisted: `GET`/`PUT` `/api/unlisted/tasks` (already shipped). Kit up/down already exists on `/lists/$listId` and `/lists/unlisted` — reuse that pattern on All’s one-pile mode. Stay on shadcn New York in `@yoink/ui-base`.

**Out of scope:**
- Create list, delete list, kill Lists nav, change Mine
- Group Today/Upcoming, notes, tags
- New domain field or a new order model

**Implementation:**
- All search: optional `pile` (`overview` omitted, `unlisted`, or a list id)
- Overview groups `GET /api/tasks?filter=all` by `listId` (named lists, then unlisted), keeping All API order within each group
- One-pile modes fetch the existing pile endpoints and persist kit up/down through the existing reorder APIs
- Playwright: overview groups; named and unlisted one-pile reorder survives refresh; overview has no up/down; Today/Upcoming/Mine and Lists nav unchanged

**Deliverable:** A member can use All as a grouped overview or as one reorderable pile, without changing the other task views.

---

## Create a named list from All - Complete ✓

**Goal**: On Tasks All, a member can create a new named list from the pile dropdown. They don’t have to go to the Lists page.

**Product rules (locked):**
- Create stays on that All dropdown. “New list” lives there.
- Same create rules already shipped: any org member (human or agent), unique in the org (trim, case-insensitive), empty-after-trim rejected.
- After create, All lands on that list’s one-pile view (`pile` = the new list id). Empty is the visible confirmation it exists — overview hides empty groups.
- Kit dialog, not `window.confirm` / native prompts. shadcn New York in `@yoink/ui-base`.
- HTTP still only maps. No new domain rules.

**Out of scope:**
- Delete from All (story 3)
- Group Today/Upcoming (story 4)
- Mine picker (story 5)
- Kill Lists nav (story 6). Lists page create can stay until story 6.
- Two-mode All stays as shipped: overview grouped no reorder; one pile reorder.

**Implementation:**
- “New list” item on the All pile Select opens the existing kit New list dialog
- `POST /api/lists` `{name}` unchanged
- After success, navigate to All with `pile` = the new list id
- Playwright: create from All, land on that empty pile, name appears in the dropdown and can be chosen again; duplicate and empty names refused; Today/Upcoming/Mine/Lists nav unchanged; no delete on All

**Deliverable:** A member can create a named list from All and see that pile, without new domain rules.

---

## Delete a named list from All - Complete ✓

**Goal**: On Tasks All, when a member is looking at one named list, they can delete that list. They cannot delete from the grouped overview or from Unlisted.

**Product rules (locked):**
- Delete only when All is on a named list, not from overview, not from Unlisted.
- Same refuse-if-open-tasks already shipped: refuse if any **open** task is on the list (409). Completed-on-list do not block; on success, clear their listId in the same command (they stay in Done, unlisted). Name is free after. Anyone in the org can delete. Kit dialog, not `window.confirm`.
- After a successful delete, leave the named-list one-pile view (that list is gone). Land back on All overview (not Unlisted).
- HTTP still only maps. No new domain rules. `DELETE /api/lists/:id` is unchanged.

**Out of scope:**
- Group Today/Upcoming (story 4)
- Mine picker (story 5)
- Kill Lists nav (story 6). Lists page delete can stay until then.
- Create from All stays as shipped (lands on the new pile).

**Implementation:**
- Delete control next to the All pile Select, visible only when `pile` is a named list id
- Reuses the kit Delete list dialog (`DeleteNamedListDialog`) already used on the Lists page
- After success, navigate to All overview (`filter=all`, no `pile`)
- Playwright: All named-list pile, delete empty list, lands on overview, name gone from dropdown; open task on list: refuse, still on that pile; overview and Unlisted: no delete-list control; Today/Upcoming/Mine/Done and Lists nav unchanged

**Deliverable:** A member can delete a named list from All’s named-list one-pile view, without new domain rules.

---

## Today and Upcoming group by list - Complete ✓

**Goal**: On Today and Upcoming, open tasks are grouped by named list (plus unlisted). You cannot change pile order there.

**Product rules (locked):**
- Today and Upcoming are the grouped overviews and cannot reorder. Group by list, including unlisted. No up/down.
- Today is a deadline view. Outer groups are overdue, then due today. Inside each, named list plus unlisted (`groupAllTasksByPile`). Upcoming has no overdue split — just list groups.
- Pin still on top of the existing filter sort (`pinned_at` then `created_at`). Do not sort these views by `openOrder`.
- Empty groups can wait (same as All overview): only show piles that have tasks in that view.
- HTTP still only maps. No new domain field.

**Out of scope:**
- All two-modes (stays as shipped)
- Create/delete from All
- Mine picker (story 5)
- Kill Lists nav (story 6)

**Implementation:**
- Reuse `groupAllTasksByPile` on Upcoming and inside each Today deadline section
- Today keeps the existing overdue / due-today split as the outer headings
- Playwright: Today shows overdue vs due today as the outer headings; inside a heading, named-list and unlisted groups; no up/down. Upcoming shows list groups, no up/down. All two-modes still has its dropdown.

**Deliverable:** A member sees Today and Upcoming grouped by list, without reorder, and without changing All / Mine / Done or the Lists nav.

---

## Mine uses All’s two-mode picker - Complete ✓

**Goal**: On Tasks Mine, a member can pick All lists / a named list / Unlisted, sees only their assigned tasks, and cannot reorder.

**Product rules (locked):**
- Mine gets the same two-mode picker as All: All lists (grouped overview, named list plus unlisted) vs one named list vs Unlisted.
- Mine is still the assignee filter: only tasks assigned to the current member.
- Mine still cannot reorder. Even in one-pile modes, no up/down. `openOrder` is one shared sequence per pile (owned by All’s one-pile views), not a Mine-specific rank.
- Empty groups wait (same as All overview): only piles that have MY tasks in the current result.
- Pin stays on the existing Mine filter sort (`pinned_at` then `created_at`). Do not sort Mine by `openOrder`.
- HTTP still only maps. No new domain field.

**Out of scope:**
- Create a named list stays on All’s dropdown, not Mine.
- Delete a named list stays on All’s named-list one-pile, not Mine.
- Today/Upcoming stay as just shipped (overdue-first on Today, list groups on Upcoming, no reorder).
- All two-modes stays: overview grouped no reorder; one-pile still has kit up/down.
- Done stays as it is.
- Lists nav stays (story 6).

**Implementation:**
- Mine search: optional `pile` (`overview` omitted, `unlisted`, or a list id), same `parseAllPile` as All
- Always `GET /api/tasks?filter=mine`; overview groups with `groupAllTasksByPile`; one-pile slices with `tasksInPile` (client-side). Do not use `GET /api/lists/:id/tasks` or `GET /api/unlisted/tasks` for Mine — those return everyone’s open tasks in that pile
- Kit Select on Mine (`#mine-pile`); All keeps `#all-pile` plus New list and delete
- Playwright: Mine overview groups my tasks; named and unlisted one-pile show only mine, no up/down; someone else’s task (including on a list I also use) stays off Mine; All still has its dropdown and one-pile reorder; Today/Upcoming/Done/Lists nav unchanged; no create/delete on Mine

**Deliverable:** A member on Tasks Mine can pick All lists / a named list / Unlisted, sees only their assigned tasks, cannot reorder, and All / Today / Upcoming / Done / Lists nav / create-delete-from-All are unchanged.

---

## Lists nav dies - Complete ✓

**Goal**: A member cannot open a Lists app. Piles live on Tasks All (and Mine as a filter). Old Lists URLs do not 404.

**Product rules (locked):**
- Lists is a dimension of the task board, not a second app. After this story there is no Lists nav and no Lists pages.
- Members find and work piles on Tasks: All two-modes (grouped overview vs one named list vs Unlisted; reorder only in one-pile). Create a named list from All’s dropdown; land on that pile. Delete a named list only from All’s named-list one-pile (not overview, not Unlisted).
- Today/Upcoming grouped (Today overdue-first then list inside; Upcoming list groups only; no reorder). Mine is a filter, not a workshop: same picker, your tasks only, no reorder. Create/delete stay on All.
- This story only removes the Lists surface. It does not add new list behavior.
- Empty named lists still appear in All’s (and Mine’s) pile dropdown even though overview hides empty groups — that dropdown is now how you find an empty list.

**Out of scope:**
- Do not change All / Mine / Today / Upcoming / Done behavior except that Lists nav is gone.
- Do not remove list APIs (`GET/POST /api/lists`, `DELETE /api/lists/:id`, list/unlisted open-task GET/PUT).
- Do not invent a new place to create/delete/order lists. Those already live on All.

**Implementation:**
- Remove the Lists nav item
- Lists routes redirect: `/lists` → Tasks All overview (`?filter=all`); `/lists/unlisted` → All unlisted (`?filter=all&pile=unlisted`); `/lists/:listId` → All named pile (`?filter=all&pile=:listId`)
- Playwright: no Lists nav; old Lists URLs land on All; All still has two-mode picker, create, delete-on-named-pile, and one-pile reorder; Mine still has its picker and cannot reorder / cannot create or delete lists; Today, Upcoming, Done stay as they are

**Deliverable:** A member cannot open a Lists app. Piles live on Tasks All (and Mine as a filter). Old Lists URLs do not 404.

---

## Yoink UI story 1: single rail + direct list screens - Complete ✓

**Goal**: A member can move among Inbox, smart views, named lists, and Unlisted from one rail. Named list and Unlisted are direct screens. All remains the working fallback for create/delete.

**Product rules (locked, Justin 2026-09-03):**
- One story at a time. This story only. Tycho writes specs/dispatches/reviews; Polly product-checks before merge.
- Approved rail order: Inbox with a count (badge hidden when the count is 0), Today, Upcoming, Mine, Done, a small Lists heading, flat named lists (no nesting), Unlisted last, + New list.
- Smart views and lists are peers. The Lists heading is not a rail item and does not nest named lists.
- Named list / Unlisted links land on the existing one-pile screens (add-task field + existing kit up/down). Do not resurrect Lists pages.
- Smart views keep current semantics: Today overdue then due-today outer with list groups inside; Upcoming list groups; Mine assignee-only with no reorder; Done completed.
- Drag stays out of scope.
- Safety property: during this story there remains a working place to create tasks and named lists. All remains available with its current dropdown / create / delete behavior as fallback. Do not retire All, remove its dropdown, or move creation yet.
- Empty named lists must remain findable (rail + All dropdown).
- Stay on shadcn New York `@yoink/ui-base`. HTTP only maps; no new domain field. Do not alter list/task APIs or domain behavior.

**Out of scope (later stories — do not implement here):**
- Story 2: move create-list / create-task off All
- Inbox pane / Snoozed / Trash tabs
- Promote sheet
- Mobile bottom-tab redesign (Inbox | Tasks stays)
- All retirement
- Visual polish beyond this frame
- Drag-and-drop reorder

**Implementation:**
- Desktop left nav is the rail (`data-app-rail`). Inbox count is `GET /api/captures?status=inbox&snoozed=false` length; the badge is omitted at 0. Named lists are `GET /api/lists` (includes empty). A small Lists heading (`data-rail-heading=lists`) sits above the first named list (or Unlisted when there are none).
- Rail named list → `/tasks?filter=all&pile=:id`. Rail Unlisted → `/tasks?filter=all&pile=unlisted`. Same one-pile screens All already owns.
- Rail + New list opens the existing kit dialog and lands on that pile. All’s dropdown New list stays.
- Mobile bottom nav stays Inbox | Tasks.
- Playwright: rail contents/order; empty Inbox has no badge; Lists heading above named lists; named-list direct screen with reorder/add-task; Unlisted direct screen with reorder/add-task; smart views unchanged; All fallback unchanged. HTTP driver stubs the new browser operations.

**Deliverable:** A member can use one rail to open Inbox, smart views, a named list, or Unlisted, without losing All as the create/delete fallback.

---

## Phase 9: Folders + Notes (Post-Launch)

**Goal**: Vision Phase B - add organizational structure and reference material

**Prerequisite**: Complete Phase 8.5 (Architecture Cleanup) first.

See [FOLDERS_AND_NOTES_DESIGN.md](./design/FOLDERS_AND_NOTES_DESIGN.md) for detailed design decisions.
See [PRODUCT_VISION.md](./design/PRODUCT_VISION.md) for product context.
See [mockups/README.md](./mockups/README.md) for UI design reference.

### Design Decisions (Resolved)

| Question | Decision | Rationale |
|----------|----------|-----------|
| **Note size** | Cards-with-expansion (50K char limit) | Preserves spatial metaphor, allows real documentation |
| **Folder nesting** | Flat only | Simpler, matches "cabinet drawer" metaphor, can expand later |
| **Archive behavior** | Query-time filtering on `folder.archived_at` | Single source of truth, instant toggle, no cascade updates |

### 9.1 Folder Entity - Not Started

**Database Schema:**
```sql
CREATE TABLE folders (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  created_by_id TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  archived_at TEXT,
  FOREIGN KEY (organization_id) REFERENCES organizations(id),
  FOREIGN KEY (created_by_id) REFERENCES users(id)
);
```

**Implementation:**
- [ ] Migration 021: Create `folders` table
- [ ] `packages/api-contracts/src/schemas/folder.ts` - Folder schema
- [ ] `packages/api-contracts/src/contracts/folder-contract.ts` - API contract
- [ ] `apps/api/src/folders/domain/` - Store interface, service, errors
- [ ] `apps/api/src/folders/infrastructure/sqlite-folder-store.ts`
- [ ] `apps/api/src/folders/application/folder-routes.ts`
- [ ] Wire up in `composition-root.ts`
- [ ] Acceptance tests: `managing-folders.test.ts`

**API Endpoints:**
- `POST /api/folders` - Create folder
- `GET /api/folders` - List folders (with `includeArchived` query param)
- `GET /api/folders/:id` - Get folder
- `PATCH /api/folders/:id` - Update folder (name)
- `POST /api/folders/:id/archive` - Archive folder
- `POST /api/folders/:id/unarchive` - Unarchive folder
- `DELETE /api/folders/:id` - Delete empty folder

### 9.2 Add folderId to Tasks - Not Started

- [ ] Migration 022: Add `folder_id` column to `tasks` table
- [ ] Update `TaskSchema` with optional `folderId`
- [ ] Update `CreateTaskSchema` with optional `folderId`
- [ ] Update task store and service
- [ ] Add folder filter to task list endpoint
- [ ] Update acceptance tests
- [ ] Update web UI task creation to include folder picker

### 9.3 Note Entity - Not Started

**Database Schema:**
```sql
CREATE TABLE notes (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  created_by_id TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  folder_id TEXT,
  capture_id TEXT,
  position_x REAL,
  position_y REAL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  FOREIGN KEY (organization_id) REFERENCES organizations(id),
  FOREIGN KEY (created_by_id) REFERENCES users(id),
  FOREIGN KEY (folder_id) REFERENCES folders(id),
  FOREIGN KEY (capture_id) REFERENCES captures(id)
);
```

**Implementation:**
- [ ] Migration 023: Create `notes` table
- [ ] `packages/api-contracts/src/schemas/note.ts` - Note schema
- [ ] `packages/api-contracts/src/contracts/note-contract.ts` - API contract
- [ ] `apps/api/src/notes/domain/` - Store interface, service, errors
- [ ] `apps/api/src/notes/infrastructure/sqlite-note-store.ts`
- [ ] `apps/api/src/notes/application/note-routes.ts`
- [ ] Wire up in `composition-root.ts`
- [ ] Acceptance tests: `managing-notes.test.ts`

**API Endpoints:**
- `POST /api/notes` - Create note
- `GET /api/notes` - List notes (with `folderId` filter)
- `GET /api/notes/:id` - Get note
- `PATCH /api/notes/:id` - Update note (title, content, position)
- `DELETE /api/notes/:id` - Delete note

### 9.4 Process Capture to Note - Not Started

- [ ] Extend `POST /api/captures/:id/process` to support `type: 'note'`
- [ ] Update `ProcessCaptureToTaskInput` → `ProcessCaptureInput` (discriminated union)
- [ ] Add "→ Note" button to capture card in inbox
- [ ] Note creation modal with title, folder picker
- [ ] Acceptance tests: `processing-captures-to-notes.test.ts`

### 9.5 Folder UI - Not Started

- [ ] Folder list sidebar/drawer
- [ ] Create folder dialog
- [ ] Folder detail view (split: tasks left, notes right)
- [ ] Archive/unarchive folder
- [ ] Folder picker component (reusable for task/note creation)

### 9.6 Note UI - Not Started

- [ ] Note card component with title preview
- [ ] Note editor with markdown support
- [ ] Spatial layout with drag positioning (Phase 9 stretch goal)
- [ ] Note creation from "→ Note" action

### Desktop Behavior Notes

Per [mockups/README.md](./mockups/README.md):
- **Desktop** = tasks/notes with `folderId = null`
- **Today/Upcoming filters** aggregate across Desktop + all Folders
- **All filter** shows Desktop-only unfiled tasks (no aggregation)
- **Folder views** are scoped to that folder only

**Estimated scope**: 4-6 weeks after Phase 8 stabilizes

---

## Phase 10: Polish + AI (Post-Launch)

**Goal**: Vision Phase C - refine based on usage, add intelligent features

### Planned Features
- AI folder suggestions during triage
- Due date views (Today, Upcoming, Someday)
- Cross-folder task search
- Quick capture directly to folder
- Keyboard shortcuts for power users

---

## Backlog

### Deferred from Earlier Phases
- [ ] Add container scanning (Trivy) to CI
- [ ] Add SAST (CodeQL/Semgrep) to CI
- [ ] Source map upload for Sentry
- [ ] Release tracking (git commit version tagging)
- [ ] Auto-delete captures in trash after 3 days
- [ ] Migration checksum validation
- [ ] Migration dry-run mode

### Technical Debt
- [ ] Refactor frontend API layer to use ts-rest clients
  - Replace raw `fetch` calls in `apps/web/src/api/auth.ts`, `tokens.ts`, `passkey.ts` with ts-rest clients
  - Use `initClient` from `@ts-rest/core` with existing contracts
  - Benefits: type-safe requests/responses, contract enforcement at compile time, consistent error handling
  - Use `ClientInferResponses` type helpers for proper error type discrimination
  - See https://ts-rest.com/client/fetch and https://ts-rest.com/contract/type-helpers

### Feature Ideas
- [ ] Rich media captures (camera/images)
- [ ] Capture from email (forward-to-address)
- [ ] URL previews/thumbnails for captured links
- [ ] Feature flagging infrastructure
- [ ] Server-side user settings persistence
- [ ] Pagination (when capture/task count warrants it)

### Task UX Polish (Phase 8.11) - Complete ✓
- [x] Overdue tasks in Today view (`dueDate <= today`)
- [x] Overdue section grouping in Today view (separate "Overdue" section at top)
- [x] Task detail/edit modal (click task title to edit)
- [x] Source capture content display in edit modal
- [x] Due date color coding (red=overdue, orange=today, green=future)

---

## Implementation Notes

### Token Format

Tokens use `tokenId:secret` format for O(1) database lookups:

```
Bearer 550e8400-e29b-41d4-a716-446655440003:mysecrettoken
       ─────────────────────────────────────:──────────────
       tokenId (UUID)                        secret
```

### Architecture Pattern

The codebase follows hexagonal architecture:

```
domain/           # Business logic (pure, testable)
  ├── entity.ts      # Data types
  ├── service.ts     # Business rules
  └── store.ts       # Port interface (what we need)

infrastructure/   # External concerns (adapters)
  └── sqlite-*.ts    # SQLite implementation of ports

application/      # HTTP layer
  └── routes.ts      # Fastify routes calling domain services
```

### Testing

See [TESTING.md](./testing/TESTING.md) for comprehensive documentation.

**Quick Reference:**
- 500+ unit tests (apps/api, packages/*)
- 199 acceptance tests (HTTP + Playwright drivers)
- `pnpm quality` - Unit tests, type checking, builds
- `./scripts/e2e-test.sh` - Acceptance tests against Docker container

#### Acceptance Test Driver Strategy

The acceptance tests use a multi-driver architecture following Dave Farley's 4-layer ATDD approach:

| Driver | Auth Mechanism | What It Tests |
|--------|----------------|---------------|
| `http` | Bearer token | Core API functionality via direct HTTP calls |
| `playwright` | Session cookie (via passkey) | Full web app UI with real browser automation |

**Why only two drivers?**

We considered adding an `http-session` driver to test session-based API access without a browser, but decided against it:

1. **WebAuthn requires real cryptography**: Session auth requires passkey signup, which needs valid WebAuthn credentials. The Playwright driver uses Chrome's CDP virtual authenticator to generate real cryptographic credentials. Mocking WebAuthn responses doesn't work because the server validates signatures.

2. **Playwright already covers session auth**: The Playwright driver tests the full web app including session-based authentication. If Playwright tests pass, we know session auth works correctly.

3. **Different purposes, not redundant coverage**: 
   - `http` driver tests the API contract and token auth path (used by extension/CLI)
   - `playwright` driver tests the web app user experience including passkey auth
   
4. **Simplicity over marginal value**: A hybrid approach (browser for signup, HTTP for operations) would add complexity for marginal benefit. The session middleware is already tested indirectly through Playwright.

**When to use each driver:**

```typescript
// Core API behavior - runs on both drivers
usingDrivers(['http', 'playwright'] as const, (ctx) => {
  it('can create a capture', async () => { ... });
});

// API-specific validation - HTTP only (no UI equivalent)
usingDrivers(['http'] as const, (ctx) => {
  it('rejects invalid UUID format', async () => { ... });
});

// Browser-specific behavior - Playwright only
usingDrivers(['playwright'] as const, (ctx) => {
  it('shows offline banner when disconnected', async () => { ... });
});
```

### URL Structure

| Path | Purpose | Auth |
|------|---------|------|
| `/api/health` | Health check | None |
| `/api/captures` | Capture CRUD | Token or session |
| `/api/tasks` | Task CRUD | Token or session |
| `/api/lists` | View, create, delete named lists; list and reorder open tasks on a list | Token or session |
| `/api/unlisted/tasks` | List and reorder open unlisted tasks | Token or session |
| `/api/auth/signup/*` | New user signup | None (public) |
| `/api/auth/login/*` | Passkey login | None (public) |
| `/api/auth/logout` | Logout | Session |
| `/api/auth/session` | Current session info | Token or session |
| `/api/auth/passkey/*` | Passkey management | Token or session |
| `/api/invitations/*` | Invitation management | Mixed (validate is public) |
| `/api/admin/*` | Admin API | Admin session cookie |
| `/admin` | Admin panel UI | Static files |
| `/` | Web app | Static files |

### Environment Variables

| Variable | Purpose | Required |
|----------|---------|----------|
| `DB_PATH` | SQLite database location (local dev) | Local dev only |
| `TURSO_DATABASE_URL` | Turso database URL | Yes (production) |
| `TURSO_AUTH_TOKEN` | Turso authentication token | Yes (production) |
| `SEED_TOKEN` | Bootstrap token secret | Optional (dev) |
| `ADMIN_PASSWORD` | Admin panel password | Yes |
| `SESSION_SECRET` | Admin + user session signing | Yes |
| `WEBAUTHN_RP_ID` | WebAuthn relying party ID | Phase 7 |
| `WEBAUTHN_RP_NAME` | WebAuthn relying party name | Phase 7 |
| `WEBAUTHN_ORIGIN` | WebAuthn allowed origin | Phase 7 |
| `WEBAUTHN_CHALLENGE_SECRET` | HMAC secret for challenge signing | Phase 7 |
| `COOKIE_SECURE` | Cookie security (`true`/`false`) | Optional (defaults based on NODE_ENV) |
| `COOKIE_SESSION_NAME` | Session cookie name | Optional (default: `yoink_session`) |
| `COOKIE_MAX_AGE` | Session cookie max age in seconds | Optional (default: 7 days) |

---

## Development Workflow

When implementing new features:

1. **Examine acceptance tests first** - Before writing any code, check `packages/acceptance-tests/src/use-cases/` for existing tests related to the feature. If adding a new capability, write the acceptance test first.

2. **Understand the DSL** - The acceptance tests use a domain-specific language. See `packages/acceptance-tests/src/dsl/` for the Actor, Admin, and Health interfaces.

3. **TDD from outside-in**:
   - Write/modify acceptance test describing the desired behavior
   - Run acceptance tests to see the failure
   - Drop down to unit tests for implementation details
   - Implement minimal code to pass
   - Refactor if valuable

4. **Verify before committing**:
   - `pnpm quality` - Unit tests, type checking, builds
   - `pnpm e2e:test` - Acceptance tests against Docker container

5. **Local preview** (optional):
   - `./scripts/local-preview.sh` - Builds Docker container, creates test credentials, copies API token to clipboard
   - Opens at http://localhost:3333 with a fresh database

See [TESTING.md](./testing/TESTING.md) for comprehensive testing documentation.

---

## CI: clear Node 20 action deprecation warnings

GitHub is already forcing these actions onto Node 24. Node 20 leaves runners on 2026-09-16. Last trunk run (`32808210813`) warned on four pins only.

**In scope** (the four that warn). Keep SHA + version-comment pins.

| Action | Now | Bump to | Files |
|---|---|---|---|
| `docker/setup-buildx-action` | v3 `8d2750c` | v4.3.0 `37fe631` | `trunk.yml`, `pr.yml` |
| `docker/build-push-action` | v6 `10e90e3` | v7.3.0 `53b7df9` | `trunk.yml`, `pr.yml` |
| `dorny/paths-filter` | v3 `de90cc6` | v4.0.3 `ceb8a2b` | `trunk.yml`, `pr.yml` |
| `superfly/flyctl-actions/setup-flyctl` | master `63da3ec` (node20) | `ed8efb3` (node24, 2026-04-08) | `trunk.yml` only |

v7 build-push / v4 paths-filter are Node 24 bumps. Our inputs (`context`, `file`, `push`/`load`, `tags`, `cache-*`, `build-args`, filter paths) should be unchanged. build-push v7 dropped unused `DOCKER_BUILD_NO_SUMMARY` / `DOCKER_BUILD_EXPORT_RETENTION_DAYS` — we do not set them.

**Out of scope for this change**

- `actions/checkout` v4, `actions/cache` v4, artifact v4, `action-gh-release` v2 — not in the warning; majors have a bigger blast radius
- `pnpm audit` is blocking again on pnpm 11 (#46)

**Verify**

1. PR (not straight to main): PR workflow covers buildx + build-push + paths-filter
2. Merge: trunk covers flyctl + deploy + smoke
3. Done when the Node 20 annotation is gone from both workflows

---

## Session Continuity Notes

When resuming work on this project:

1. Run `pnpm quality` to verify all tests pass
2. Check this PLAN.md for current phase and remaining tasks
3. Read recent git commits for implementation context
4. **Examine acceptance tests** for the feature area you're working on
5. Continue with TDD: write failing test → implement → refactor

### Current Focus: Judge captures/lists/task-update sandwich, then 8.5.4

**Named lists story 8 is in.** A member can see and change the open-task order of the unlisted pile (`GET`/`PUT` `/api/unlisted/tasks`, `decideReorderOpenTasks` with `listId: null`). Same complete/uncomplete/land-at-end rules as story 7. All/Today/Mine/Upcoming stay pin-then-created. Kit up/down on `/lists/unlisted`. Named-list order stays as story 7.

**All has two modes is in.** Tasks All is a grouped overview of every pile (named lists plus unlisted, no reorder, not ranked by openOrder) or one pile with kit up/down via the existing list/unlisted APIs. Today, Upcoming, Mine, Done, and the Lists nav are unchanged.

**Create a named list from All is in.** On All, New list lives on the pile dropdown (kit dialog, same unique-in-org create). After create, All lands on that list’s one-pile view so an empty list is visible. Lists nav stays.

**Delete a named list from All is in.** On All, delete is only on a named-list one-pile (kit dialog, same refuse-if-open-tasks). Overview and Unlisted have no delete-list control. After success, All lands on overview. Lists page delete and Lists nav stay.

**Today and Upcoming group by list is in.** Today is overdue vs due today on the outside, then named list plus unlisted inside each (reuse `groupAllTasksByPile`). Upcoming is list groups only. No up/down. Pin stays on the existing filter sort, not openOrder. All two-modes, Mine, Done, and the Lists nav stay.

**Mine uses All’s two-mode picker is in.** Tasks Mine has All’s two-mode picker (overview grouped by list plus unlisted, or one named list / Unlisted). Still assignee-only. No up/down even in one-pile. Client-side group/filter of `GET /api/tasks?filter=mine` — not the pile APIs. Create/delete stay on All. Today, Upcoming, and Done stay.

**Yoink UI story 1 is in.** Desktop rail: Inbox (count hidden at 0), Today, Upcoming, Mine, Done, Lists heading, flat named lists, Unlisted, + New list. Named list/Unlisted land on existing All one-pile screens. All stays as fallback (dropdown/create/delete). Mobile bottom nav unchanged. Do not start story 2 (move create) or later UI work from this story.

**Lists nav dies is in.** There is no Lists nav and no Lists pages. Piles live on Tasks All (create/delete/reorder) and Mine (filter only). Old `/lists`, `/lists/unlisted`, and `/lists/:listId` URLs redirect onto All. List APIs stay. Empty named lists are found in the pile dropdown.

**Named lists story 7 is in.** A member can see and change the open-task order on a named list. Complete/uncomplete are sandwiches so the remembered index can restore (and clamp).

**Named lists story 6 is in.** A member can delete a named list that has no open tasks. Completed-on-list do not block; persist unlists those completed tasks then hard-deletes the list row. Sandwich `decideDeleteNamedList`; kit Dialog on the Lists page. Order and notes canvas stay out.

**Named lists story 5 is in.** An existing open task can be taken off a named list (`listId: null`, one bucket → unlisted). Already-unlisted is a no-op. Completed stays put. PATCH sandwich extended; kit Select can clear.

**Named lists story 3 is in.** An existing open task can be put on a named list (`listId`, one bucket). PATCH is a write sandwich. Kit Select on task edit, same bar as assignee.

**Identity slice is in.** Agents are token-only org members; tasks have an assignee field. The edit-modal assignee control is the kit Select (same look as other form controls and menus). Playwright acceptance tests prove the task row shows the assignee name and the edit picker can set an agent, set the current human, and clear. Agent tokens can list org members (humans and agents) so they can pick an assignee; they still cannot mint agents, remove members, or create captures. Do not start Phase 9 from this slice.

**Captures I/O sandwich pilot is in.** See [FUNCTIONAL_CORE.md](./architecture/FUNCTIONAL_CORE.md). Lists view/create/delete and task create/PATCH follow it. Next: keep, adjust, or abandon before touching access or folders/notes.

### Current Focus: Phase 8.5 (Architecture Cleanup)

**Phases 1-8 Complete!** The foundation is solid:
- Capture → Task flow working
- Passkey-based authentication for web app users
- Session-based auth with 7-day expiry
- Invitation-only signup with multi-org support
- User token self-service for extension/CLI access
- Task UX polish (overdue handling, edit modal, color coding)
- Full acceptance test coverage (199+ acceptance tests, 500+ unit tests)

**Why Architecture Cleanup Before Phase 9?**
Adding new entities (folders, notes) on top of the old entity-shaped modules would have compounded boundary violations. Phase 8.5 established:
- Top-level modules as **DDD bounded contexts** (`access/` = Administration and Access: auth, users, orgs, memberships, invitations, admin) — see the 2026-07-29 addendum in `docs/architecture/MODULAR_MONOLITH.md` for the Nygard-based rationale
- Clean `index.ts` entry points per layer (cross-context imports go through them; intra-context deep imports are fine)
- A working ESLint boundaries setup (resolver fixed; 15 real cross-context warnings, down from a 524-warning noise baseline)
- Composition tests (`apps/api/src/tests/composition/`) guarding DI wiring, conditional routes, and error shapes

**Remaining Phase 8.5 work:**
1. **8.5.4 Service Boundaries (reduced scope)** - Fix the tagged `TODO(8.5.4)` cross-context deep imports (health, app.ts), merge duplicated admin error factories, review the invitation↔membership lifecycle seam
2. **8.5.5 Enforce Boundaries** - ESLint rules to error, entry-point restrictions, CI
3. **8.5.6 Aggregate Persistence** - `db.batch()` for atomic signup

**Key Reference Files:**
- `docs/architecture/MODULAR_MONOLITH.md` - Architecture design document (read the addendum first)
- `docs/architecture/ESLINT_BASELINE.md` - Current lint/boundary baseline
- `apps/api/src/access/domain/index.ts` - Public API of the access context
- `apps/api/src/access/domain/signup-service.ts` - Multi-aggregate operation for 8.5.6

**After Phase 8.5:**
- Phase 9 design decisions are already resolved (see `docs/design/FOLDERS_AND_NOTES_DESIGN.md`), but shape the implementation as bounded contexts: the `processing ↔ captures/tasks` lint warnings suggest captures + tasks + processing (+ folders/notes) form one "Capture" context — decide during Phase 9 design rather than adding entity-CRUD modules
- Follow TDD: Write acceptance tests first, then implement

The [PROJECT_BRIEF.md](./design/PROJECT_BRIEF.md) contains the original design specification. The [PRODUCT_VISION.md](./design/PRODUCT_VISION.md) has the evolved vision including folders and notes. This PLAN.md tracks what's actually built.

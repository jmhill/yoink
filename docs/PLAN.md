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
**Phase 8.5: Architecture Cleanup** - In Progress

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

**System Invariant**: Users must always have at least 1 passkey. This is enforced by preventing deletion of the last passkey.

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

### 8.5.2 Module Consolidation - Not Started
- [ ] Create `identity/` directory structure
- [ ] Move `users/` files into `identity/`
- [ ] Move `auth/` files into `identity/`
- [ ] Move `OrganizationMembership` from `organizations/` to `identity/`
- [ ] Move `invitations/application/` into `organizations/application/`
- [ ] Delete empty directories
- [ ] Create clean `index.ts` files for each layer
- [ ] Update all import paths
- [ ] Run `pnpm quality` and fix any breaks

**Deliverable:** Consolidated module structure

### 8.5.3 Clean Up Re-exports - Not Started
- [ ] Identify all external consumers of re-exported types
- [ ] Update imports to use canonical sources
- [ ] Remove re-exports from identity/domain/index.ts
- [ ] Ensure index.ts only exports public API

**Deliverable:** Clean entry points with no re-exports

### 8.5.4 Fix Service Boundary Violations - Not Started
- [ ] Add missing service methods (UserService.getUsersByIds, OrganizationService.listOrganizations, etc.)
- [ ] Refactor `TokenService` to use `UserService` (internal to identity)
- [ ] Refactor `SignupService` to use services
- [ ] Refactor `AdminService` to be a facade
- [ ] Remove direct store imports in services
- [ ] Update composition-root.ts with new dependency wiring

**Deliverable:** No service imports stores from another module

### 8.5.5 Enforce Boundaries - Not Started
- [ ] Change ESLint rules from warn to error
- [ ] Enable entry-point restrictions
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

## Session Continuity Notes

When resuming work on this project:

1. Run `pnpm quality` to verify all tests pass
2. Check this PLAN.md for current phase and remaining tasks
3. Read recent git commits for implementation context
4. **Examine acceptance tests** for the feature area you're working on
5. Continue with TDD: write failing test → implement → refactor

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
Adding new entities (folders, notes) on top of current architecture would compound existing boundary violations. Phase 8.5 establishes:
- ESLint-enforced module boundaries
- Clean `index.ts` entry points
- Services call services (not foreign stores)
- AdminService as facade pattern
- Atomic aggregate persistence with `db.batch()`

**Implementation Order for Phase 8.5:**
1. **8.5.1 ESLint Setup** - Install and configure `eslint-plugin-boundaries`
2. **8.5.2 Module Consolidation** - Merge `auth/` + `users/` → `identity/`
3. **8.5.3 Clean Up Re-exports** - Remove the 60+ re-exports in `auth/domain/index.ts`
4. **8.5.4 Fix Service Boundaries** - Services call services, not foreign stores
5. **8.5.5 Enforce Boundaries** - ESLint errors in CI
6. **8.5.6 Aggregate Persistence** - `db.batch()` for atomic signup

**Key Reference Files:**
- `docs/architecture/MODULAR_MONOLITH.md` - Architecture design document
- `apps/api/src/auth/domain/index.ts` - Current re-export anti-pattern (to be fixed)
- `apps/api/src/admin/domain/admin-service.ts` - To become facade pattern
- `apps/api/src/auth/domain/signup-service.ts` - Multi-aggregate operation to fix

**After Phase 8.5:**
- Phase 9 design decisions are already resolved (see `docs/design/FOLDERS_AND_NOTES_DESIGN.md`)
- Follow TDD: Write acceptance tests first, then implement
- New entities will follow the clean patterns established in Phase 8.5

The [PROJECT_BRIEF.md](./design/PROJECT_BRIEF.md) contains the original design specification. The [PRODUCT_VISION.md](./design/PRODUCT_VISION.md) has the evolved vision including folders and notes. This PLAN.md tracks what's actually built.

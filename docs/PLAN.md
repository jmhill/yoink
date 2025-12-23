# Yoink Implementation Plan

This document tracks the implementation progress of the Yoink universal capture system. It serves as a persistent "master plan" that carries context across Claude sessions.

For the full design document and architectural details, see [PROJECT_BRIEF.md](./PROJECT_BRIEF.md).

For the product vision and roadmap, see [REVISED_PRODUCT_VISION_20251223.md](./REVISED_PRODUCT_VISION_20251223.md).

---

## Current Status

**Phase 1: Backend Foundation** - Complete ✓
**Phase 2: Admin Panel (Backend + Frontend)** - Complete ✓
**Phase 2.5: Capture Inbox Web App** - Complete ✓
**Phase 3: PWA + Android Share** - Complete ✓
**Phase 3.1: PWA Polish** - Complete ✓
**Phase 4: Browser Extension** - Complete ✓
**Testing Infrastructure** - Complete ✓ (4-layer architecture, 92 acceptance tests, 322 unit tests)
**CI/CD Optimizations** - Complete ✓
**Multi-Driver E2E Test Runner** - Complete ✓
**Phase 4.5: Security Hardening** - Complete ✓ (critical and medium items)
**Phase 4.6: Database Migration Infrastructure** - Complete ✓ (critical items)
**Phase 5.5: Snooze Feature** - Complete ✓
**Phase 6.1: Sentry Integration** - Complete ✓
**Phase 6.2: Structured Logging** - Complete ✓
**Phase 6.3: Archive → Trash Rename** - Complete ✓
**Phase 6.4: Deletion Features** - Complete ✓
**Phase 7: Authentication Overhaul** - Not Started (passkeys, invitations)
**Phase 8: Capture → Task Flow** - In Progress (Vision Phase A)

---

## Phase 1: Backend Foundation

**Goal**: Working API with persistence and multi-tenant auth

### Completed

- [x] Initialize monorepo (pnpm workspaces)
- [x] Set up packages/infrastructure (Clock, IdGenerator, PasswordHasher)
  - `createClock()` - real system clock
  - `createFakeClock()` - testable clock with auto-advance option
  - `createIdGenerator()` - UUID v4 generator
  - `createFakeIdGenerator()` - sequential IDs for deterministic tests
  - `createBcryptPasswordHasher()` - bcrypt with 10 salt rounds
  - `createFakePasswordHasher()` - `fake-hash:` prefix for tests
- [x] Create apps/api scaffold (Fastify)
- [x] Auth domain:
  - [x] Organization, User, ApiToken entities
  - [x] OrganizationStore, UserStore, TokenStore interfaces (ports)
  - [x] SQLite adapters for all stores
  - [x] TokenService (validate with tokenId:secret format, O(1) lookup)
  - [x] Token auth middleware (Bearer token → auth context)
- [x] Captures domain:
  - [x] Capture entity, CaptureService, CaptureStore interface
  - [x] SQLite adapter with organization scoping
- [x] Application layer:
  - [x] POST /captures - create capture
  - [x] GET /captures - list captures (with status filter, pagination)
  - [x] GET /captures/:id - get single capture
  - [x] PATCH /captures/:id - update capture (title, content, status)
- [x] Archive captures (via status update, sets archivedAt timestamp)
- [x] Seed script for bootstrapping org/user/token (SEED_TOKEN env var)
- [x] CI pipeline (GitHub Actions with pnpm quality script)
- [x] Contract tests for all endpoints

**Deliverable**: Can POST/GET/PATCH captures via curl with a seeded token ✓

---

## Phase 2: Web App (Inbox + Admin)

**Goal**: View/manage captures and provision access via browser

### Admin Panel (Backend API) - Complete ✓
- [x] Admin session auth (ADMIN_PASSWORD env var)
- [x] Admin login/logout endpoints (POST /admin/login, /admin/logout)
- [x] Organizations API (GET/POST /admin/organizations, GET /admin/organizations/:id)
- [x] Users API (GET/POST /admin/organizations/:id/users, GET /admin/users/:id)
- [x] Tokens API (GET/POST /admin/users/:id/tokens, DELETE /admin/tokens/:id)
- [x] Session cookie authentication for protected routes

### Admin Panel (Frontend) - Complete ✓
- [x] Turborepo setup for monorepo build orchestration
- [x] apps/admin scaffold (Vite + React + TanStack Router)
- [x] Tailwind CSS v4 + shadcn/ui components
- [x] ts-rest API client consuming @yoink/api-contracts
- [x] Admin login page UI
- [x] Organizations list + create UI
- [x] Organization detail (users list + create + rename) UI
- [x] User detail (tokens list + create/revoke) UI
- [x] Session-based auth guard (redirects to /login if unauthorized)
- [x] Fastify static file serving from /admin
- [x] Dockerfile multi-stage build includes admin UI
- [x] Rename organization functionality (PATCH endpoint + UI)
- [x] Cache-control headers (no-cache for HTML, immutable for hashed assets)
- [x] Custom 404 page with link to login

### Capture Inbox - Complete ✓
- [x] Create apps/web scaffold (Vite + React + TanStack Router)
- [x] Set up API client (ts-rest with @yoink/api-contracts)
- [x] Token configuration page (/config with localStorage)
- [x] Quick add input at top of inbox
- [x] Inbox view (list captures, newest first)
- [x] Archive action (button with hover reveal)
- [x] Archived view with unarchive action
- [x] Tab navigation between Inbox and Archived
- [x] Dockerfile serves web app at / and admin at /admin
- [x] Playwright driver for browser-based acceptance tests

**Deliverable**: Can create org/user/token via admin panel, then use inbox with that token ✓

---

## Phase 3: PWA + Android Share - Complete ✓

**Goal**: Capture from Android via share intent

### PWA Infrastructure - Complete ✓
- [x] Add vite-plugin-pwa for manifest and service worker generation
- [x] Create icon generation script (scripts/generate-pwa-icons.mjs)
  - Generates 192x192, 512x512, maskable icons from assets/yoink.png
  - Apple touch icon (180x180) and favicon
- [x] Configure PWA manifest with theme color (#FBC4AB), icons, display: standalone
- [x] Update index.html with PWA meta tags (theme-color, apple-mobile-web-app-*)
- [x] Service worker auto-registers with precaching for static assets

### Share Target - Complete ✓
- [x] Add share_target to manifest (GET method with title/text/url params)
- [x] Create /share route with floating quick-add modal UI
- [x] Parse and combine share params (title\n\ntext\n\nurl format)
- [x] Save button creates capture, shows toast, closes after 1s delay
- [x] Redirect to /config?from=share if no token configured

### Offline Handling - Complete ✓
- [x] Create useNetworkStatus hook (tracks navigator.onLine)
- [x] Add offline banner to root layout (yellow warning bar)
- [x] Disable quick-add input when offline with explanatory placeholder
- [x] Show offline warning in share modal, disable save button

**Deliverable**: Can install PWA on Android, share text to it ✓

---

## Phase 3.1: PWA Polish

**Goal**: Address mobile UX issues discovered in exploratory testing

### Bug Fixes
- [x] Fix archive buttons not visible on mobile (hover-reveal doesn't work on touch)
- [x] Create settings page with logout option (Settings button currently clears token unexpectedly)
- [x] Parse share intent URL separately into `sourceUrl` field (not combined into content)
- [x] Display source URL in share modal as separate read-only field
- [x] Display source URL on capture cards in inbox/archived views

### Performance
- [x] Set `min_machines_running = 1` in Fly.io config to eliminate cold start latency

### Discovered During Phase 3.1
*(Track any new issues found while implementing the above)*

**Deliverable**: Mobile-friendly inbox with proper share target URL handling

---

## Phase 4: Browser Extension - Complete ✓

**Goal**: Quick capture from desktop browser

- [x] Create apps/extension scaffold (Vite + React + TypeScript)
- [x] Manifest v3 setup with permissions (activeTab, storage, contextMenus, notifications)
- [x] Popup UI with quick-add input, selection auto-fill, page title fallback
- [x] Content script to grab selection and page info
- [x] Options page (API URL + token config with validation)
- [x] Background service worker for context menu captures
- [x] Keyboard shortcut (Ctrl+Shift+Y / Cmd+Shift+Y)
- [x] Build pipeline with Vite multi-entry bundling
- [x] CI workflow for extension build + auto-release on changes
- [x] Icon generation script (scripts/generate-extension-icons.mjs)

**Deliverable**: Working extension in Chromium browsers (Chrome, Brave, Edge) ✓

### Extension Features
- **Popup**: Quick-add text input, auto-fills with selected text or page title
- **Context Menu**: Right-click selected text → "Capture with Yoink"
- **Keyboard Shortcut**: Ctrl+Shift+Y (Windows/Linux) / Cmd+Shift+Y (Mac)
- **Options Page**: Configure API URL and token with validation
- **Notifications**: Success/error feedback for context menu captures

### CI/CD
- Extension builds automatically when `apps/extension/**` or `packages/api-contracts/**` changes
- GitHub Release created on main branch with versioned ZIP (e.g., `extension-2024-01-15-abc1234`)
- Download ZIP from GitHub Releases, unzip, load unpacked in Chrome

---

## Phase 4.5: Security Hardening

**Goal**: Prepare for demo and external users with critical security improvements

A comprehensive security review identified the following priorities before sharing the app with friends and other users.

### Critical Fixes (Before Demo)
- [x] Rate limiting on admin login (brute force protection)
- [x] Security headers via @fastify/helmet (CSP, X-Frame-Options, etc.)
- [x] Non-root user in Dockerfile (container security)
- [x] Dependency vulnerability scanning in CI (`pnpm audit`)

### Medium Priority (Before Wider Rollout)
- [x] Pin GitHub Actions to commit SHAs (supply chain security)
- [x] Fix token enumeration timing oracle

### Deferred (Production Hardening)
- [ ] Implement passkeys (see [PASSKEY_AUTHENTICATION.md](./PASSKEY_AUTHENTICATION.md)) - prerequisite for multi-org
- [ ] Add container scanning (Trivy) to CI
- [ ] Add SAST (CodeQL/Semgrep) to CI
- [x] Enable Dependabot for automated updates

### Security Assessment Summary

**API Token Security**: Adequate for demo phase
- Token format: `tokenId:secret` with bcrypt-hashed secrets
- ~244 bits of entropy (UUID v4 for both parts)
- Hash never exposed in API responses
- Generic error messages prevent information leakage

**Known Acceptable Risks**:
- Tokens don't expire (mitigated by small user count, manual auditing)
- Web app uses localStorage for tokens (mitigated by React's XSS protection)
- Stateless admin sessions can't be revoked early (mitigated by 24-hour TTL)

**Deliverable**: Demo-ready security posture with rate limiting, security headers, and hardened container

---

## Phase 4.6: Database Migration Infrastructure

**Goal**: Robust migration system for evolutionary database design

As the application grows toward features like passkeys, image capture, and tags, the migration infrastructure needs to support safe schema evolution.

### Critical (Now) - Complete ✓
- [x] Add transaction wrapping to migrator (prevent partial migration corruption)
- [x] Split migrations into individual files (better maintainability and git history)
- [x] Create table rebuild helper (for complex schema changes in SQLite)

### Medium Priority (Production Hardening)
- [ ] Add migration checksum validation (detect unauthorized modifications)
- [ ] Add dry-run mode (preview what would be applied)
- [ ] Add schema validation (verify expected tables/columns exist post-migration)

### Design Notes

**Why these changes?**

SQLite has limited `ALTER TABLE` support compared to PostgreSQL/MySQL. You cannot:
- Drop columns (in older SQLite versions)
- Change column types
- Add NOT NULL to existing columns
- Modify constraints

The "table rebuild" pattern is required for these operations:
1. Create new table with desired schema
2. Copy data from old table
3. Drop old table
4. Rename new table

**File structure after migration split:**
```
database/
  migrations/
    001-create-organizations.ts
    002-create-users.ts
    003-create-api-tokens.ts
    004-create-captures.ts
    index.ts  # Re-exports all migrations in order
  migrator.ts
  migrator.test.ts
  table-rebuild.ts
  table-rebuild.test.ts
```

**Deliverable**: Migration infrastructure ready for passkeys, image capture, and other schema-evolving features

---

## Phase 5: Deployment - Complete ✓

**Goal**: Running in production

- [x] Dockerize API
- [x] Deploy to Fly.io
- [x] Set up SQLite persistence (Fly volume)
- [x] Configure HTTPS (Fly.io handles automatically)
- [x] CI/CD pipeline (GitHub Actions → Fly.io)
- [x] Health endpoint (`GET /api/health`) with Fly.io HTTP health checks
- [x] Post-deploy smoke test job in CI
- [x] Deploy web app (same service or separate static host)
- [x] Install PWA on phone, extension in browser

### Smoke Test Setup (One-Time)

After first deploy with health endpoint:
1. Check Fly.io logs: `flyctl logs -a jhtc-yoink-api`
2. Find line: `Seeded API token: <tokenId>:<secret>`
3. Add as GitHub secret: `SMOKE_TEST_TOKEN`
4. Future deploys will run full smoke tests (health + capture creation)

**Deliverable**: Fully functional personal capture system

---

## Phase 5.5: Snooze Feature

**Goal**: Temporarily hide captures and have them resurface after a specified time

### API Refactor (Complete) ✓
- [x] Replace generic PATCH with explicit operation endpoints
  - POST /captures/:id/archive and /unarchive
  - POST /captures/:id/pin and /unpin
- [x] Update web app and acceptance tests to use new endpoints

### Backend (Complete) ✓
- [x] Add `snoozedUntil` field to CaptureSchema (ISO timestamp or null)
- [x] Add POST /captures/:id/snooze endpoint (accepts `until` timestamp)
- [x] Add POST /captures/:id/unsnooze endpoint
- [x] Add `snoozed` boolean query param to GET /captures
  - `snoozed=true`: only captures with snoozedUntil in the future
  - `snoozed=false`: exclude snoozed captures (default for inbox)
- [x] Migration 006-add-snoozed-until.ts
- [x] Business rules:
  - Can't snooze archived captures
  - Snooze time must be in future
  - Archiving clears snooze
  - Pin and snooze can coexist

### Acceptance Tests (Complete) ✓
- [x] Create snoozing-captures.test.ts (11 tests)
- [x] Test snooze creation with valid future time
- [x] Test snooze appears in snoozed list, not inbox
- [x] Test unsnooze returns capture to inbox immediately
- [x] Test archive clears snooze
- [x] Test pin and snooze can coexist
- [x] Test validation: past time rejected, archived capture rejected
- [x] Test not found handling for snooze/unsnooze

### Web App UI (Complete) ✓
- [x] Add Snoozed tab (leftmost: Snoozed | Inbox | Archived)
- [x] Add snooze button to capture cards (left position, before Pin)
- [x] Snooze dropdown with options:
  - "Later today" (6pm same day, or 2h if past 4pm)
  - "Tomorrow" (9am next day)
  - "Next week" (Monday 9am)
- [x] Create /snoozed route showing snoozed captures with wake times
- [x] Show "Waking in [time]" on snoozed capture cards
- [x] Unsnooze button on snoozed captures
- [x] Optimistic updates for snooze/unsnooze mutations

### Design Decisions
- **Snooze filtering**: Client compares `snoozedUntil` vs current time (no lazy DB updates)
- **Status vs modifiers**: `status` is workflow (inbox/archived), `pinnedAt`/`snoozedUntil` are display modifiers
- **Pin + Snooze coexist**: When snooze expires, pinned captures appear at top of inbox

**Deliverable**: Can snooze captures to resurface later without push notifications

---

## Phase 6: Observability

**Goal**: Production-grade error tracking, performance monitoring, and structured logging

### 6.1 Sentry Integration

Error tracking and performance monitoring via Fly.io's Sentry partnership (1 year free Team Plan).

#### Backend (apps/api) - Complete ✓
- [x] Run `fly ext sentry create` to provision Sentry and set SENTRY_DSN secret
- [x] Install `@sentry/node`
- [x] Create `src/instrument.ts` for early Sentry initialization
- [x] Update start script to use `--import` flag for ESM instrumentation
- [x] Configure `setupFastifyErrorHandler(app)` for automatic error capture
- [x] Enable tracing with `tracesSampleRate: 0.1` (10% sampling)

#### Frontend (apps/web) - Complete ✓
- [x] Install `@sentry/react`
- [x] Create `src/instrument.ts` for initialization
- [x] Configure `tanstackRouterBrowserTracingIntegration(router)` for route tracing
- [x] Configure `replayIntegration()` with `replaysOnErrorSampleRate: 1.0`
- [x] Set `tracePropagationTargets` to connect frontend→backend traces
- [x] Pass VITE_SENTRY_DSN via Docker build arg in CI

#### CI Configuration
- [x] Add `SENTRY_DSN` as GitHub secret for frontend build
- [x] Pass build arg in docker/build-push-action

#### Configuration
- Single Sentry project for unified frontend→backend trace view
- Environment-aware: skip init when `SENTRY_DSN` not set (local dev)
- Environment tags: `production`, `development`

#### Deferred
- [ ] Source map upload (requires Sentry auth token setup)
- [ ] Release tracking (git commit version tagging)

**Deliverable**: Errors and performance issues automatically captured with session context

---

### 6.2 Structured Logging - Complete ✓

OTEL-compatible structured logging using Pino (Fastify's built-in logger).

- [x] Enable Pino in Fastify with JSON output to stdout
- [x] Configure `pino-pretty` for human-readable development output
- [x] Add request context injection (requestId, userId, orgId)
- [x] Standardize log field names (`msg`, `level`, `time`, `requestId`, etc.)
- [x] Configure sensitive field redaction (tokens, passwords)
- [x] Set LOG_LEVEL environment variable support (default: `info` in prod, `debug` in dev)

#### Implementation Details
- **Log config**: `LogConfigSchema` in `config/schema.ts` with level and pretty options
- **Logger factory**: `createLoggerOptions()` in `src/logging/logger.ts`
- **Auth context**: Injected via `request.log.child()` in auth middleware
- **Redaction**: Authorization header and cookies automatically redacted
- **Environment variables**: `LOG_LEVEL` (fatal/error/warn/info/debug/trace)

#### Design Decisions
- **Format**: JSON to stdout (Fly.io captures automatically)
- **Dev experience**: `pino-pretty` for local development (auto-enabled when `NODE_ENV !== 'production'`)
- **OTEL ready**: Field names compatible with future `@opentelemetry/instrumentation-pino`

**Deliverable**: Consistent, searchable structured logs in Fly.io's log infrastructure

---

### 6.3 Archive → Trash Rename - Complete ✓

**Goal**: Replace "Archive" terminology with "Trash" throughout the app for clearer user mental model

This rename prepares for the deletion feature - users expect to delete items from "Trash", not "Archive".

#### Database Migration
- [x] Migration 007-rename-archive-to-trash.ts
  - Renames `archived_at` column to `trashed_at`
  - Converts status values from `'archived'` to `'trashed'`
  - Uses table rebuild pattern for SQLite compatibility

#### Schema & Contracts
- [x] Update CaptureSchema: `status: 'archived'` → `'trashed'`, `archivedAt` → `trashedAt`
- [x] Rename endpoints: `/archive` → `/trash`, `/unarchive` → `/restore`

#### Backend
- [x] Update capture store, service, commands, errors, routes
- [x] Rename error type: `CaptureAlreadyArchivedError` → `CaptureAlreadyTrashedError`
- [x] Update SQLite column mapping

#### Acceptance Tests
- [x] Update DSL types and actor methods
- [x] Update all use-case tests (organizing-work, snoozing-captures, tenant-isolation)
- [x] Update Playwright page objects (ArchivedPage → TrashPage)

#### Web App
- [x] Create `/trash` route (replacing `/archived`)
- [x] Update tab navigation labels and icons
- [x] Update swipe action types and CSS variables
- [x] Update component props (onArchive → onTrash)

**Deliverable**: Consistent "Trash" terminology throughout the app ✓

---

### 6.4 Deletion Features - Complete ✓

**Goal**: Allow permanent deletion of captures from trash, with auto-cleanup of old items

#### Database Migration - Complete ✓
- [x] Migration 008-add-deleted-at.ts
  - Adds `deleted_at` column for soft-delete functionality

#### Schema & Contracts - Complete ✓
- [x] Add DELETE /api/captures/:id endpoint (204 success, 409 if not in trash)
- [x] Add POST /api/captures/trash/empty endpoint (returns deletedCount)

#### Backend - Complete ✓
- [x] Add `CaptureNotInTrashError` error type
- [x] Add `DeleteCaptureCommand` and `EmptyTrashCommand` commands
- [x] Add `softDelete` and `softDeleteTrashed` methods to CaptureStore
- [x] Update SQLite queries to exclude soft-deleted captures (`deleted_at IS NULL`)
- [x] Add `delete` and `emptyTrash` methods to CaptureService
- [x] Add routes for delete and emptyTrash endpoints

#### Acceptance Tests - Complete ✓
- [x] deleting-captures.test.ts with HTTP and Playwright drivers
- [x] Test permanent deletion of trashed captures
- [x] Test deleted captures excluded from inbox and trash lists
- [x] Test empty trash bulk operation
- [x] Test cannot delete non-trashed captures (409 error)

#### Web App UI - Complete ✓
- [x] Delete button on individual trash items with confirmation dialog
- [x] "Empty Trash" button with confirmation dialog
- [x] Optimistic updates for delete mutations

#### Deferred
- [ ] Auto-delete items in trash > 3 days (lazy cleanup on list)

#### Design Decisions
- **Soft-delete approach**: Items get `deletedAt` timestamp, remain in DB but hidden from all queries
- **Trash requirement**: Can only delete items that are already in trash (409 error otherwise)
- **Empty Trash**: Bulk operation that deletes all trashed items for the organization

**Deliverable**: Users can permanently delete captures from trash ✓

---

### 6.5 OTEL Tracing (Deferred)

Full OpenTelemetry distributed tracing - to be implemented when needed.

- [ ] Add `@opentelemetry/instrumentation-pino` for trace context in logs
- [ ] Evaluate `pino-opentelemetry-transport` for direct log export
- [ ] Consider full OTEL SDK for distributed tracing beyond Sentry

---

## Phase 7: Authentication Overhaul

**Goal**: Replace API token UX with passkeys for proper user authentication before public release

See [PASSKEY_AUTHENTICATION.md](./PASSKEY_AUTHENTICATION.md) for detailed implementation plan.

### 7.1 Passkeys Implementation
- [ ] Add WebAuthn library (@simplewebauthn/server, @simplewebauthn/browser)
- [ ] Database schema for passkey credentials
- [ ] Registration flow (create passkey for existing user)
- [ ] Authentication flow (sign in with passkey)
- [ ] Session management (replace API tokens for web app)
- [ ] Update web app to use passkey auth instead of token config

### 7.2 Invitation System
- [ ] Invitation entity (inviteCode, email, orgId, expiresAt, usedAt)
- [ ] POST /api/admin/organizations/:id/invitations (create invite)
- [ ] GET /api/invitations/:code (validate invite)
- [ ] POST /api/invitations/:code/accept (register with passkey)
- [ ] Admin UI for creating and managing invitations
- [ ] Email notification (optional - can start with manual code sharing)

### 7.3 Auth Migration
- [ ] Deprecate token configuration page in web app
- [ ] Keep API token auth for extension/programmatic access
- [ ] Add "Devices" view in settings (manage passkeys)

**Deliverable**: Users can sign in with passkeys, new users join via invitation

---

## Phase 8: Capture → Task Flow

**Goal**: Implement Vision Phase A - captures become the entry point for tasks

See [REVISED_PRODUCT_VISION_20251223.md](./REVISED_PRODUCT_VISION_20251223.md) for full context.

**Key Design Decisions:**
- Captures gain a third status: `processed` (permanently archived after becoming a task/note)
- Processing a capture is a one-way operation - no "unprocess"
- When a task is deleted, its source capture (if any) is also deleted
- Pin moves from captures to tasks (captures are for triage only, not fussing)
- New fields use `processed` language: `processedAt`, `processedToType`, `processedToId`
- Process endpoint: `POST /api/captures/:id/process` with discriminated union body

### 8.1 Remove Pin from Captures (UI First)
Ordered for backwards compatibility: UI changes first, then API, then database.

- [ ] **Web App**: Remove pin button from CaptureCard component
- [ ] **Web App**: Remove pin-related optimistic updates and mutations
- [ ] **Web App**: Remove pin sorting logic from inbox view
- [ ] **Acceptance Tests**: Remove/update pin-related capture tests
- [ ] **API Contract**: Remove pin/unpin endpoints from capture-contract
- [ ] **Backend**: Remove pin/unpin commands, service methods, routes
- [ ] **Migration 009**: Drop `pinned_at` column from captures (table rebuild)
- [ ] **Schema**: Remove `pinnedAt` field from CaptureSchema

### 8.2 Add Processing Fields to Captures
- [ ] **Migration 010**: Add `processed_at`, `processed_to_type`, `processed_to_id` columns
- [ ] **Schema**: Add `processedAt`, `processedToType`, `processedToId` to CaptureSchema
- [ ] **Schema**: Add `processed` to status enum (`'inbox' | 'trashed' | 'processed'`)
- [ ] **Backend**: Update list queries to exclude `status = 'processed'` from inbox/trash

### 8.3 Task Entity Backend
New domain following hexagonal architecture pattern.

#### Domain Layer
- [ ] `apps/api/src/tasks/domain/task.ts` - Task entity type
- [ ] `task-store.ts` - Store interface (port)
- [ ] `task-service.ts` - Business logic with neverthrow Result types
- [ ] `task-commands.ts` - Command/query types
- [ ] `task-errors.ts` - Domain error types

#### Infrastructure
- [ ] **Migration 011**: Create `tasks` table
  - `id`, `organization_id`, `created_by_id`, `title`, `capture_id`
  - `due_date`, `completed_at`, `pinned_at`, `order`, `created_at`
- [ ] `sqlite-task-store.ts` - SQLite adapter
- [ ] `fake-task-store.ts` - In-memory fake for unit tests

#### API Contract
- [ ] Add `packages/api-contracts/src/schemas/task.ts`
- [ ] Add `packages/api-contracts/src/contracts/task-contract.ts`
  - POST /api/tasks (create)
  - GET /api/tasks (list, with `completed` filter)
  - GET /api/tasks/:id
  - PATCH /api/tasks/:id (update title, dueDate)
  - POST /api/tasks/:id/complete
  - POST /api/tasks/:id/uncomplete
  - POST /api/tasks/:id/pin
  - POST /api/tasks/:id/unpin
  - DELETE /api/tasks/:id

#### Application Layer
- [ ] `task-routes.ts` - Fastify routes
- [ ] Wire up in `composition-root.ts`

#### Unit Tests
- [ ] `task-service.test.ts`
- [ ] `sqlite-task-store.test.ts`

### 8.4 Process Capture Endpoint
Cross-entity operation: creates task + updates capture status.

- [ ] **API Contract**: Add `POST /api/captures/:id/process` endpoint
  - Request body (discriminated union):
    ```typescript
    { type: 'task', data: { title?: string, dueDate?: string } }
    // Future: { type: 'note', data: { title?: string, content?: string } }
    ```
  - Response: The created Task
- [ ] **Backend**: Add `ProcessCaptureCommand` with validation
  - Capture must exist and be in `inbox` status
  - Creates task with `captureId` reference
  - Updates capture: `status = 'processed'`, sets `processedAt`, `processedToType`, `processedToId`
- [ ] **Backend**: Cascade delete - when task deleted, delete associated capture too
- [ ] **Unit Tests**: Process behavior, validation, cascade delete

### 8.5 Acceptance Tests for Tasks
- [ ] Create `packages/acceptance-tests/src/use-cases/managing-tasks.test.ts`
- [ ] Extend DSL types (`Task` type in `types.ts`)
- [ ] Extend `CoreActor` interface with task methods:
  - `createTask()`, `listTasks()`, `getTask()`, `updateTask()`
  - `completeTask()`, `uncompleteTask()`
  - `pinTask()`, `unpinTask()`, `deleteTask()`
  - `processCapture(captureId, type, data)`
- [ ] Implement HTTP driver for task operations
- [ ] Implement Playwright driver + `TasksPage` page object

#### Test Cases
- [ ] Create task directly (not from capture)
- [ ] Complete/uncomplete task
- [ ] Pin/unpin task (pinned tasks appear first)
- [ ] Delete task
- [ ] Process capture to task
- [ ] Processed capture excluded from inbox
- [ ] Capture links back to task via `processedToId`
- [ ] Deleting task also deletes source capture
- [ ] Tasks isolated by organization

### 8.6 Tasks Desktop UI
- [ ] Create `/tasks` route in `apps/web/src/routes/_authenticated/tasks.tsx`
- [ ] Create `TaskCard` component:
  - Checkbox for completion toggle
  - Pin button (filled when pinned)
  - Due date display (if set)
  - Delete button
- [ ] Create `TaskList` with Framer Motion animations
- [ ] Quick "Add task" input at top of tasks view
- [ ] CRUD mutations with optimistic updates
- [ ] Pin/unpin mutations with list re-sorting
- [ ] Complete/uncomplete mutations

### 8.7 Triage UI ("→ Task" Action)
- [ ] Add "→ Task" button to `CaptureCard` in inbox (alongside Snooze/Trash)
- [ ] Create `TaskCreationModal` component:
  - Title input (pre-filled from capture content, first 100 chars)
  - Due date picker (optional)
  - Create button
- [ ] On success: capture disappears from inbox, toast with "View task" link
- [ ] Update tab navigation: Snoozed | Inbox | Tasks | Trash

### 8.8 Deferred (Post-Phase 8)
- [ ] Task reordering (drag-and-drop or up/down buttons)
- [ ] Completed tasks section (collapsed by default)
- [ ] Due date views (Today, Upcoming, Someday)

**Deliverable**: Captures can be processed into tasks on a desktop view. Tasks have pin, complete, delete. Processing is one-way and preserves capture as reference.

---

## Phase 9: Folders + Notes (Post-Launch)

**Goal**: Vision Phase B - add organizational structure and reference material

See [REVISED_PRODUCT_VISION_20251223.md](./REVISED_PRODUCT_VISION_20251223.md) for details.

### Planned Features
- Folder entity (name, archivedAt)
- Note entity (title, content/markdown, folderId, position for spatial layout)
- Folder picker in task creation
- "→ Note" action on captures
- Split-view folder UI (tasks left, spatial notes right)
- Markdown editor for notes

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

## Future Enhancements

Items not on the critical path but worth considering. See Phase 7-10 for the main roadmap.

### Completed Quick Wins
- [x] Dark mode with system preference detection
- [x] Extension notification feedback + Alt+Shift+Y shortcut
- [x] Optimistic updates for web app and admin panel mutations
- [x] Faster PWA update detection
- [x] Error state handling with context-aware actions
- [x] Multiple themes (Tokyo Night)
- [x] App header improvements (pig icon, branding)
- [x] Keep quick entry focused after submit
- [x] Swipe gestures on mobile
- [x] Better social captures (URL detection from text param)
- [x] TanStack Router migration to new plugin API

### Capture Feature Backlog
- [ ] Auto-delete captures in trash after 3 days (lazy cleanup on list query)
- [ ] Rich media captures (camera/images) - likely Phase 9+
- [ ] Capture from email (forward-to-address)
- [ ] URL previews/thumbnails for captured links

### Infrastructure Backlog
- [ ] Feature flagging infrastructure
- [ ] Server-side user settings persistence
- [ ] Admin panel improvements (duplicate detection, deletion)
- [ ] Container scanning (Trivy) in CI
- [ ] SAST (CodeQL/Semgrep) in CI
- [ ] Source map upload for Sentry
- [ ] Release tracking (git commit version tagging)
- [ ] Pagination (when capture/task count warrants it)

### Post-Launch Considerations
- [ ] Multi-org membership (users belong to multiple organizations)
- [ ] Community edition (self-hostable Yoink)
- [ ] AI: Summarize captured links
- [ ] AI: RAG search over captures and notes

### Removed from Consideration
- ~~Pull-to-refresh~~ - Native browser/PWA behavior works
- ~~Polling/SSE for data changes~~ - React Query refetch is sufficient
- ~~Pin on captures~~ - Removed by design (see Vision doc); Pin belongs on tasks/notes
- ~~Capture editing (markdown)~~ - Captures stay raw; Notes (Phase 9) get markdown
- ~~Card layout with drag-and-drop for captures~~ - Notes get spatial layout instead

### Won't Fix / Platform Limitations
- ~~Highlight and share on mobile including link~~ - Android limitation ([Chromium bug #789379](https://bugs.chromium.org/p/chromium/issues/detail?id=789379))

---

## Implementation Notes

### Token Format

Tokens use `tokenId:secret` format for O(1) database lookups:

```
Bearer 550e8400-e29b-41d4-a716-446655440003:mysecrettoken
       ─────────────────────────────────────:──────────────
       tokenId (UUID)                        secret
```

The middleware:
1. Parses `tokenId:secret` from Bearer header
2. Looks up ApiToken by tokenId (single indexed query)
3. Verifies secret against stored bcrypt hash
4. Loads User and Organization for auth context

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

### Testing Infrastructure - Complete ✓

See [TESTING.md](./TESTING.md) for comprehensive documentation on the testing strategy.

**Quick Reference:**
- 188 unit tests (apps/api, packages/*)
- 92 acceptance tests (HTTP + Playwright)
- `pnpm quality` - Unit tests, type checking, builds
- `pnpm e2e:test` - Acceptance tests against Docker container

#### Acceptance Test Review (Complete) ✓
- [x] Read use cases
- [x] Compare driver implementations
- [x] Ensure drivers are not including test logic
- [x] Implement the improved driver selection helper functions
  - Split `Actor` into `CoreActor` (all drivers) + `BrowserActor` (Playwright only)
  - Created `usingDrivers` helper with TypeScript overloads for type-safe context:
    - `['http'] as const` → `HttpContext` with `createAdminWithCredentials`, `createActorWithCredentials`
    - `['playwright'] as const` → `PlaywrightContext` with `BrowserActor`
    - `['http', 'playwright'] as const` → `BaseContext` with `CoreActor`
  - All tests updated to use new pattern with `ctx.driverName` for driver-specific describe blocks
  - Fixed DSL violations in `authenticating.test.ts` and `token-security.test.ts`

See [ACCEPTANCE_TEST_AUDIT.md](./ACCEPTANCE_TEST_AUDIT.md) for detailed findings.

### CI/CD Optimizations

Implemented performance and efficiency improvements to the CI pipeline:

**Path Filtering**
- CI pipeline skips runs for documentation-only changes
- Ignored paths: `docs/**`, `*.md`, `AGENTS.md`, `CLAUDE.md`, `.github/workflows/claude*.yml`
- Claude Code Review workflow still runs on all PRs (useful for doc quality review)

**Dependency Caching**
- pnpm store cached using `actions/cache@v4`
- Cache key based on `pnpm-lock.yaml` hash
- Applied to both `quality` and `e2e-tests` jobs

**Docker Layer Caching**
- Switched from manual `docker build` to `docker/build-push-action@v6`
- Uses GitHub Actions cache (`type=gha`) for layer caching
- Requires `docker/setup-buildx-action@v3` for BuildKit support

**Benefits:**
- Documentation PRs don't trigger expensive Docker builds and E2E tests
- Subsequent CI runs reuse cached dependencies (faster installs)
- Docker builds reuse cached layers when Dockerfile/dependencies unchanged

### Testing Approach

- **TDD**: All code written in response to failing tests
- **Behavior testing**: Test through public APIs, not implementation
- **Fake dependencies**: Clock, IdGenerator, PasswordHasher have fake implementations
- **In-memory SQLite**: Integration tests use `:memory:` databases

### URL Structure

All API endpoints are under the `/api` prefix:

| Path | Purpose |
|------|---------|
| `/api/health` | Health check |
| `/api/captures` | Capture CRUD (Bearer token auth) |
| `/api/admin/*` | Admin API (session cookie auth) |
| `/admin` | Admin panel UI (static files) |
| `/` | Reserved for web app (Capture Inbox) |

### Environment Variables

| Variable | Purpose | Required |
|----------|---------|----------|
| `DB_PATH` | SQLite database location | Yes (production) |
| `SEED_TOKEN` | Bootstrap token secret | Optional (dev) |
| `ADMIN_PASSWORD` | Admin panel password | Phase 2 |
| `SESSION_SECRET` | Admin session signing | Phase 2 |

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
   - Useful for testing production builds before deploying

See [TESTING.md](./TESTING.md) for comprehensive testing documentation.

---

## Session Continuity Notes

When resuming work on this project:

1. Run `pnpm quality` to verify all tests pass
2. Check this PLAN.md for current phase and remaining tasks
3. Read recent git commits for implementation context
4. **Examine acceptance tests** for the feature area you're working on
5. Continue with TDD: write failing test → implement → refactor

The PROJECT_BRIEF.md contains the full design specification. This PLAN.md tracks what's actually built.

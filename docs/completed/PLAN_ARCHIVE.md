# Yoink Implementation Plan - Completed Phases Archive

This document contains the detailed implementation history of completed phases. For the current plan and active phases, see [PLAN.md](../PLAN.md).

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

### Critical Fixes (Before Demo)
- [x] Rate limiting on admin login (brute force protection)
- [x] Security headers via @fastify/helmet (CSP, X-Frame-Options, etc.)
- [x] Non-root user in Dockerfile (container security)
- [x] Dependency vulnerability scanning in CI (`pnpm audit`)

### Medium Priority (Before Wider Rollout)
- [x] Pin GitHub Actions to commit SHAs (supply chain security)
- [x] Fix token enumeration timing oracle
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

### Critical (Now) - Complete ✓
- [x] Add transaction wrapping to migrator (prevent partial migration corruption)
- [x] Split migrations into individual files (better maintainability and git history)
- [x] Create table rebuild helper (for complex schema changes in SQLite)

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

### 6.1 Sentry Integration - Complete ✓

Error tracking and performance monitoring via Fly.io's Sentry partnership (1 year free Team Plan).

#### Backend (apps/api)
- [x] Run `fly ext sentry create` to provision Sentry and set SENTRY_DSN secret
- [x] Install `@sentry/node`
- [x] Create `src/instrument.ts` for early Sentry initialization
- [x] Update start script to use `--import` flag for ESM instrumentation
- [x] Configure `setupFastifyErrorHandler(app)` for automatic error capture
- [x] Enable tracing with `tracesSampleRate: 0.1` (10% sampling)

#### Frontend (apps/web)
- [x] Install `@sentry/react`
- [x] Create `src/instrument.ts` for initialization
- [x] Configure `tanstackRouterBrowserTracingIntegration(router)` for route tracing
- [x] Configure `replayIntegration()` with `replaysOnErrorSampleRate: 1.0`
- [x] Set `tracePropagationTargets` to connect frontend→backend traces
- [x] Pass VITE_SENTRY_DSN via Docker build arg in CI

#### Configuration
- Single Sentry project for unified frontend→backend trace view
- Environment-aware: skip init when `SENTRY_DSN` not set (local dev)
- Environment tags: `production`, `development`

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

#### Database Migration
- [x] Migration 008-add-deleted-at.ts
  - Adds `deleted_at` column for soft-delete functionality

#### Schema & Contracts
- [x] Add DELETE /api/captures/:id endpoint (204 success, 409 if not in trash)
- [x] Add POST /api/captures/trash/empty endpoint (returns deletedCount)

#### Backend
- [x] Add `CaptureNotInTrashError` error type
- [x] Add `DeleteCaptureCommand` and `EmptyTrashCommand` commands
- [x] Add `softDelete` and `softDeleteTrashed` methods to CaptureStore
- [x] Update SQLite queries to exclude soft-deleted captures (`deleted_at IS NULL`)
- [x] Add `delete` and `emptyTrash` methods to CaptureService
- [x] Add routes for delete and emptyTrash endpoints

#### Acceptance Tests
- [x] deleting-captures.test.ts with HTTP and Playwright drivers
- [x] Test permanent deletion of trashed captures
- [x] Test deleted captures excluded from inbox and trash lists
- [x] Test empty trash bulk operation
- [x] Test cannot delete non-trashed captures (409 error)

#### Web App UI
- [x] Delete button on individual trash items with confirmation dialog
- [x] "Empty Trash" button with confirmation dialog
- [x] Optimistic updates for delete mutations

#### Design Decisions
- **Soft-delete approach**: Items get `deletedAt` timestamp, remain in DB but hidden from all queries
- **Trash requirement**: Can only delete items that are already in trash (409 error otherwise)
- **Empty Trash**: Bulk operation that deletes all trashed items for the organization

**Deliverable**: Users can permanently delete captures from trash ✓

---

## Phase 7.5: Turso Database Migration - Complete ✓

**Goal**: Migrate from SQLite on Fly.io volume to Turso-hosted LibSQL for zero-downtime deployments

See [TURSO_MIGRATION.md](./TURSO_MIGRATION.md) for detailed implementation plan.

**Why now?**
- Phase 7.1-7.3 added new tables (memberships, passkeys, sessions) - good checkpoint before more schema changes
- Phase 8 complete and stable
- Single user makes downtime coordination trivial
- Removes volume complexity before adding more infrastructure

### 7.5.0 Turso Setup (Manual) - Complete ✓
- [x] Create Turso account and database (`turso db create yoink-prod --location iad`)
- [x] Restore data from Litestream S3 backup to Turso
- [x] Set Fly.io secrets (`TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`)

### 7.5.1 Dependencies - Complete ✓
- [x] Add `@libsql/client` to `apps/api`

### 7.5.2 Database Abstraction Layer - Complete ✓
- [x] Create abstract `Database` interface in `database/types.ts`
- [x] Create LibSQL client implementation in `database/database.ts`
- [x] Update `DatabaseConfigSchema` for turso/file/memory discriminated union

### 7.5.3 Update Store Implementations (7 files) - Complete ✓
- [x] `sqlite-capture-store.ts` - convert to async
- [x] `sqlite-task-store.ts` - convert to async
- [x] `sqlite-user-store.ts` - convert to async
- [x] `sqlite-token-store.ts` - convert to async
- [x] `sqlite-organization-store.ts` - convert to async
- [x] `sqlite-organization-membership-store.ts` - convert to async
- [x] `sqlite-passkey-credential-store.ts` - convert to async

### 7.5.4 Update Transaction & Migrator - Complete ✓
- [x] Update `transaction.ts` for async transactions
- [x] Update `table-rebuild.ts` for async operations
- [x] Update `migrator.ts` for async migrations
- [x] Update all 16 migration files to async

### 7.5.5 Update Entry Points - Complete ✓
- [x] Update `composition-root.ts` - new `Infrastructure` type
- [x] Update `index.ts` - conditional directory creation
- [x] Update `migrate.ts` - Turso config loading
- [x] Update `processing-service.ts` - use `database` instead of `db`

### 7.5.6 Update Tests (12 files) - Complete ✓
- [x] Create `database/test-utils.ts` helper with `createTestDatabase()` and `createBareTestDatabase()`
- [x] Update `database/migrator.test.ts`
- [x] Update `database/transaction.test.ts`
- [x] Update `database/table-rebuild.test.ts`
- [x] Update `captures/infrastructure/sqlite-capture-store.test.ts`
- [x] Update `auth/infrastructure/sqlite-organization-store.test.ts`
- [x] Update `auth/infrastructure/sqlite-user-store.test.ts`
- [x] Update `auth/infrastructure/sqlite-token-store.test.ts`
- [x] Update `auth/infrastructure/sqlite-organization-membership-store.test.ts`
- [x] Update `auth/infrastructure/sqlite-passkey-credential-store.test.ts`
- [x] Update `composition-root.test.ts`
- [x] Update `processing/domain/processing-service.test.ts`
- [x] Update `security.test.ts`
- [x] Update `tests/helpers/test-app.ts`

### 7.5.7 Update Infrastructure - Complete ✓
- [x] Remove `[mounts]` section from `fly.toml`
- [x] Change deploy strategy to `bluegreen`
- [x] Remove Litestream from `Dockerfile`
- [x] Simplify `run.sh`
- [x] Delete `litestream.yml`

### 7.5.8 Deploy & Verify - Complete ✓
- [x] Destroy old machine and volume (required to remove mount dependency)
- [x] Deploy to Fly.io in `iad` region (East Coast, near Turso DB)
- [x] Configure `min_machines_running = 1` to avoid cold starts
- [x] Verify blue-green deployment strategy enabled

**Deliverable**: Zero-downtime deployments enabled, simplified infrastructure (no volumes, no Litestream) ✓

---

## Phase 8: Capture → Task Flow - Complete ✓

**Goal**: Implement Vision Phase A - captures become the entry point for tasks

See [PRODUCT_VISION.md](../design/PRODUCT_VISION.md) for full context.

**Key Design Decisions:**
- Captures gain a third status: `processed` (permanently archived after becoming a task/note)
- Processing a capture is a one-way operation - no "unprocess"
- When a task is deleted, its source capture (if any) is also deleted
- Pin moves from captures to tasks (captures are for triage only, not fussing)
- New fields use `processed` language: `processedAt`, `processedToType`, `processedToId`
- Process endpoint: `POST /api/captures/:id/process` with discriminated union body
- Tasks without due dates appear only in "All" filter, not Today/Upcoming
- Direct task creation is allowed (source capture is optional)
- Share target always creates captures in inbox (no direct share-to-task)

**Navigation Architecture (Mobile-First):**
```
┌─────────────────────────────────────┐
│ [🐷 {View Name}]        [Settings] │  ← Header
├─────────────────────────────────────┤
│ [Snoozed | Inbox | Trash]          │  ← Sub-tabs (Inbox view)
│ or [Today | Upcoming | All]         │  ← Sub-tabs (Tasks view)
├─────────────────────────────────────┤
│         Content Area                │
├─────────────────────────────────────┤
│      [Inbox]    [Tasks]             │  ← Bottom nav (NEW)
└─────────────────────────────────────┘
```

### 8.1 Remove Pin from Captures (UI First) - Complete ✓
- [x] **Web App**: Remove pin button from CaptureCard component
- [x] **Web App**: Remove pin-related optimistic updates and mutations
- [x] **Web App**: Remove pin sorting logic from inbox view
- [x] **Acceptance Tests**: Remove/update pin-related capture tests
- [x] **API Contract**: Remove pin/unpin endpoints from capture-contract
- [x] **Backend**: Remove pin/unpin commands, service methods, routes
- [x] **Migration 009**: Drop `pinned_at` column from captures (table rebuild)
- [x] **Schema**: Remove `pinnedAt` field from CaptureSchema

### 8.2 Add Processing Fields to Captures - Complete ✓
- [x] **Migration 010**: Add `processed_at`, `processed_to_type`, `processed_to_id` columns
- [x] **Schema**: Add `processedAt`, `processedToType`, `processedToId` to CaptureSchema
- [x] **Schema**: Add `processed` to status enum (`'inbox' | 'trashed' | 'processed'`)
- [x] **Backend**: Update SQLite store to handle new fields in row mapping and updates
- [x] **Contract**: Update list query to accept `processed` status filter

### 8.3 Task Entity Backend - Complete ✓
New domain following hexagonal architecture pattern.

#### Domain Layer
- [x] `apps/api/src/tasks/domain/task.ts` - Task entity type (in schemas)
- [x] `task-store.ts` - Store interface (port)
- [x] `task-service.ts` - Business logic with neverthrow Result types
- [x] `task-commands.ts` - Command/query types
- [x] `task-errors.ts` - Domain error types

#### Infrastructure
- [x] **Migration 011**: Create `tasks` table
- [x] `sqlite-task-store.ts` - SQLite adapter
- [x] `fake-task-store.ts` - In-memory fake for unit tests

#### API Contract
- [x] Add `packages/api-contracts/src/schemas/task.ts`
- [x] Add `packages/api-contracts/src/contracts/task-contract.ts`

#### Application Layer
- [x] `task-routes.ts` - Fastify routes
- [x] Wire up in `composition-root.ts`

#### Unit Tests
- [x] `task-service.test.ts` - 27 tests
- [x] Task schema tests - 25 tests

### 8.4 Process Capture Endpoint - Complete ✓
- [x] **API Contract**: Add `POST /api/captures/:id/process` endpoint
- [x] **Backend**: Add `ProcessCaptureCommand` with validation
- [x] **Backend**: Cascade delete - when task deleted, delete associated capture too
- [x] **Unit Tests**: Process behavior, validation, cascade delete (13 tests)

### 8.5 Acceptance Tests for Tasks - Complete ✓
- [x] Create `packages/acceptance-tests/src/use-cases/managing-tasks.test.ts` (22 tests)
- [x] Create `packages/acceptance-tests/src/use-cases/processing-captures.test.ts` (10 tests)
- [x] Extend DSL types (`Task` type in `types.ts`)
- [x] Extend `CoreActor` interface with task methods
- [x] Implement HTTP driver for task operations
- [x] Add placeholder stubs to Playwright actor

### 8.6 Bottom Navigation + Routing - Complete ✓
- [x] Create bottom navigation component with `Inbox | Tasks` tabs
- [x] Restructure routing
- [x] Update header to show current view name dynamically
- [x] Add safe-area-bottom CSS for iOS PWA support

### 8.7 Tasks View UI - Complete ✓
- [x] Create `/tasks` route
- [x] Sub-tabs: Today | Upcoming | All
- [x] Create `TaskCard` component
- [x] CRUD mutations with optimistic updates
- [x] Add Checkbox component to ui-base package

### 8.8 Triage UI ("→ Task" Action) - Complete ✓
- [x] Add "→ Task" button to `CaptureCard` in inbox
- [x] Create `TaskCreationModal` component
- [x] On success: capture disappears from inbox, toast with "View" action

### 8.9 Completed Tasks Tab - Complete ✓
- [x] Add "Done" tab to Tasks view (4th tab: Today | Soon | All | Done)
- [x] Backend already supported `completed` filter
- [x] Hide quick-add form on Done tab
- [x] Responsive tab labels ("Upcoming" → "Soon" on mobile)

**Deliverable**: Mobile-first bottom navigation with Inbox and Tasks tabs. Captures can be processed into tasks. Tasks have pin, complete, delete, due dates. Processing is one-way and preserves capture as reference.

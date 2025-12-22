# Yoink Implementation Plan

This document tracks the implementation progress of the Yoink universal capture system. It serves as a persistent "master plan" that carries context across Claude sessions.

For the full design document and architectural details, see [PROJECT_BRIEF.md](./PROJECT_BRIEF.md).

---

## Current Status

**Phase 1: Backend Foundation** - Complete ✓
**Phase 2: Admin Panel (Backend + Frontend)** - Complete ✓
**Phase 2.5: Capture Inbox Web App** - Complete ✓
**Phase 3: PWA + Android Share** - Complete ✓
**Phase 3.1: PWA Polish** - Complete ✓
**Phase 4: Browser Extension** - Complete ✓
**Testing Infrastructure** - Complete ✓ (4-layer architecture, 92 acceptance tests, 266 unit tests)
**CI/CD Optimizations** - Complete ✓
**Multi-Driver E2E Test Runner** - Complete ✓
**Phase 4.5: Security Hardening** - Complete ✓ (critical and medium items)
**Phase 4.6: Database Migration Infrastructure** - Complete ✓ (critical items)
**Phase 5.5: Snooze Feature** - Complete ✓

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
- [ ] Enable Dependabot for automated updates

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

## Future Enhancements

Ideas for future consideration, roughly prioritized:

### Maintenance and Chores
- [x] Migrate away from deprecated TanStackRouterVite export
  - Replaced `TanStackRouterVite` with `tanstackRouter` from `@tanstack/router-plugin/vite`
  - Added recommended options: `{ target: 'react', autoCodeSplitting: true }`

### Tier 1: Quick Wins
- [x] Dark mode with system preference detection
  - PWA: Uses theme CSS variables (`bg-background`, `text-muted-foreground`)
  - Extension: External `theme-init.js` script (Manifest V3 CSP blocks inline scripts)
- [x] Extension: Fix notification feedback for context menu captures
- [x] Extension: Add Alt+Shift+Y as alternative quick capture shortcut
- [x] Optimistic updates for web app mutations (create, archive, unarchive)
- [x] Faster PWA update detection (5-min interval + visibility change listener with debounce)
- [x] Optimistic updates for admin panel mutations (see [OPTIMISTIC_UPDATES.md](./OPTIMISTIC_UPDATES.md))
- [x] Fix bad network error state (red error message on "Failed to load captures")
  - Created reusable `ErrorState` component with context-aware actions
  - 401 errors direct to Settings to reconfigure token
  - Network errors show "Try Again" with refetch capability
  - Header and tabs remain visible during errors (user can navigate)
- [x] More themes (Tokyo Night)
  - Two-layer theming: mode (light/dark/system) + color theme (default/tokyo-night)
  - Tokyo Night colors from official VS Code theme palette
  - Settings page shows both Mode and Theme selectors
  - Admin panel has toggle buttons for mode and theme
  - Color theme stored in localStorage (`colorTheme` key)
- [x] App header improvements (pig icon, branding)
  - Replaced "Yoink" text with clickable pig icon that links to inbox
  - Extracted shared `Header` component to reduce duplication
  - Increased settings icon size for visual balance
- [x] Keep quick entry focused after submit for rapid multi-capture

### Won't Fix / Platform Limitations
- ~~Fix highlight and share on mobile browser not including link~~
  - **Reason**: Android platform limitation - when sharing selected text, the OS does not include the page URL in the share intent. The `url` parameter is empty and the URL is not embedded in `text` either. This is a known Android limitation ([Chromium bug #789379](https://bugs.chromium.org/p/chromium/issues/detail?id=789379)). Users should use "Share page" instead of text selection to include the source URL.

### Tier 2: Feature Additions
- [x] Pin capture to top (boolean flag + sort order)
  - Pinned captures appear first in inbox, sorted by pinnedAt (most recent first)
  - Archiving a pinned capture automatically unpins it
  - Visual indicator: accent border on left edge of pinned cards
- [x] Swipe gestures on mobile
  - Inbox: swipe right to archive (green), swipe left to open snooze menu (amber)
  - Archived: swipe left to unarchive (blue)
  - Snoozed: swipe left to wake up (blue)
  - Theme-aware colors (Tokyo Night uses palette colors)
  - Visual feedback with icon/label reveal during swipe
- [ ] Auto archive/delete captures after configurable number of days
- [ ] Better social captures
  - [ ] Twitter/X improvements
  - [ ] LinkedIn improvements

### Tier 3: Architectural Work
- [ ] Server-side user settings persistence
  - Store settings (theme mode, color theme) in `settings` JSON column on users table
  - GET/PATCH /api/user/settings endpoints
  - Sync from server on app load, merge with localStorage
  - Enables consistent settings across devices
  - Migration: 007-add-user-settings.ts
- [ ] Observability (logging, metrics, tracing)
- [ ] Feature flagging infrastructure
- [ ] Implement passkeys (see [PASSKEY_AUTHENTICATION.md](./PASSKEY_AUTHENTICATION.md))
  - Prerequisite for multi-org membership and improved auth UX
- [ ] Admin panel improvements
  - Duplicate email detection (reject creating user with existing email in org)
  - Organization name uniqueness validation
  - User deletion
  - Organization deletion
- [ ] Multi-org membership (users can belong to multiple organizations)
  - Enables sharing workspaces with family/coworkers
  - Requires auth model redesign, depends on passkeys
- [ ] Capture editing
  - Markdown rendering for capture content display
  - Markdown editor for capture editing (with preview)
- [ ] Rich media captures
  - Camera integration on Android for photo captures
  - Image attachment support in capture entity
  - Audio notes
- [ ] Capture from email (forward-to-address or other mechanism)

### Tier 4: Deferred / Low Priority
- [ ] Card layout with drag-and-drop reordering
- [ ] URL previews/thumbnails
- [ ] Pagination (not needed while capture count is manageable)
- [ ] Community edition (make Yoink self-hostable for anyone)

### Tier 5: AI Features
- [ ] Summarize links (AI-generated summaries for captured URLs)
- [ ] RAG search over old captures (semantic search using embeddings)

### Removed from Consideration
- ~~Pull-to-refresh~~ - Native browser/PWA behavior, already works
- ~~Polling/SSE for data changes~~ - React Query's refetch handles this adequately

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

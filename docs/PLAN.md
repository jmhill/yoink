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
**Testing Infrastructure** - Complete ✓ (4-layer architecture, 58 acceptance tests, 241 unit tests)
**CI/CD Optimizations** - Complete ✓
**Multi-Driver E2E Test Runner** - Complete ✓
**Phase 4.5: Security Hardening** - In Progress

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
- [ ] Non-root user in Dockerfile (container security)
- [ ] Dependency vulnerability scanning in CI (`pnpm audit`)

### Medium Priority (Before Wider Rollout)
- [ ] Pin GitHub Actions to commit SHAs (supply chain security)
- [ ] Downgrade to Node 22 LTS (stable runtime)
- [ ] Fix token enumeration timing oracle
- [ ] Add optional token expiration

### Deferred (Production Hardening)
- [ ] Implement passkeys (see [PASSKEY_AUTHENTICATION.md](./PASSKEY_AUTHENTICATION.md))
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

## Phase 5: Deployment

**Goal**: Running in production

- [x] Dockerize API
- [x] Deploy to Fly.io
- [x] Set up SQLite persistence (Fly volume)
- [x] Configure HTTPS (Fly.io handles automatically)
- [x] CI/CD pipeline (GitHub Actions → Fly.io)
- [x] Health endpoint (`GET /api/health`) with Fly.io HTTP health checks
- [x] Post-deploy smoke test job in CI
- [ ] Deploy web app (same service or separate static host)
- [ ] Install PWA on phone, extension in browser

### Smoke Test Setup (One-Time)

After first deploy with health endpoint:
1. Check Fly.io logs: `flyctl logs -a jhtc-yoink-api`
2. Find line: `Seeded API token: <tokenId>:<secret>`
3. Add as GitHub secret: `SMOKE_TEST_TOKEN`
4. Future deploys will run full smoke tests (health + capture creation)

**Deliverable**: Fully functional personal capture system

---

## Future Enhancements

Ideas for future consideration (not yet scheduled):

### Capture Editing
- [ ] Markdown rendering for capture content display
- [ ] Markdown editor for capture editing (with preview)

### Rich Media Captures
- [ ] Camera integration on Android for photo captures
- [ ] Image attachment support in capture entity
- [ ] Image display in inbox/archived views

### User Experience
- [ ] Dark mode with system preference detection
- [ ] Swipe-to-archive gesture on mobile
- [ ] Pull-to-refresh in inbox

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
- 172 unit tests (apps/api, packages/*)
- 58 acceptance tests (44 HTTP + 14 Playwright)
- `pnpm quality` - Unit tests, type checking, builds
- `pnpm e2e:test` - Acceptance tests against Docker container

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

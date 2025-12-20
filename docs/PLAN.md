# Yoink Implementation Plan

This document tracks the implementation progress of the Yoink universal capture system. It serves as a persistent "master plan" that carries context across Claude sessions.

For the full design document and architectural details, see [PROJECT_BRIEF.md](./PROJECT_BRIEF.md).

---

## Current Status

**Phase 1: Backend Foundation** - Complete ✓
**Phase 2: Admin Panel (Backend + Frontend)** - Complete ✓
**Phase 2.5: Capture Inbox Web App** - Complete ✓
**Testing Infrastructure** - Complete ✓ (4-layer architecture, 42 acceptance tests, 172 unit tests)
**CI/CD Optimizations** - Complete ✓

---

## Next Up: Multi-Driver E2E Test Runner

**Goal**: Run acceptance tests against both HTTP and Playwright drivers in a single execution with unified reporting.

See **[E2E_MULTI_DRIVER_PLAN.md](./E2E_MULTI_DRIVER_PLAN.md)** for the full implementation plan.

### Summary

1. **Fix Playwright Driver** - Currently doesn't actually test UI behavior; needs to verify actions work
2. **Refactor Test Harness** - Run each test against all applicable drivers in single vitest run
3. **Custom Reporter** - Output unified markdown table showing pass/fail/N/A per test per driver
4. **Update CI** - Install Playwright browsers, run both drivers, show report in step summary

### Key Changes

| Current | New |
|---------|-----|
| `DRIVER=http` or `DRIVER=playwright` | Both drivers run automatically |
| Two separate test runs for "all" | Single vitest execution |
| Report only shows last driver | Unified table: `\| Test \| http \| playwright \|` |
| Playwright assumes behavior | Playwright verifies UI state |

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

## Phase 3: PWA + Android Share

**Goal**: Capture from Android via share intent

- [ ] Add PWA manifest with share_target
- [ ] Implement /share route handler
- [ ] Service worker for installability
- [ ] Handle offline gracefully (show error, don't crash)
- [ ] Test on actual Android device

**Deliverable**: Can install PWA on Android, share text to it

---

## Phase 4: Browser Extension

**Goal**: Quick capture from desktop browser

- [ ] Create apps/extension scaffold
- [ ] Manifest v3 setup
- [ ] Popup UI (selection + source URL)
- [ ] Content script to grab selection
- [ ] Options page (API URL, token config)
- [ ] Build pipeline (extension needs bundling)

**Deliverable**: Working extension in Chromium browsers (Chrome, Brave, Edge)

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

We implement Dave Farley's 4-layer acceptance test architecture:

```
┌─────────────────────────────────────────────────────────────────┐
│  Use Cases (plain English test descriptions)                    │
│  "Capturing notes", "Organizing work", "Managing tenants"       │
├─────────────────────────────────────────────────────────────────┤
│  DSL (domain interfaces)                                        │
│  Actor, Admin, Health - pure TypeScript interfaces              │
├─────────────────────────────────────────────────────────────────┤
│  Drivers (implement DSL interfaces)                             │
│  HTTP driver, Playwright driver                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Test counts:**
- 172 unit tests (apps/api, packages/*)
- 42 acceptance tests (packages/acceptance-tests)
  - HTTP driver: 42 tests
  - Playwright driver: 14 tests (admin-only tests skipped)

**Commands:**
- `pnpm quality` - Run unit tests, type checking, and builds
- `pnpm e2e:test` - Run acceptance tests against Docker container
- `DRIVER=playwright pnpm e2e:test` - Run with Playwright driver only
- `DRIVER=all pnpm e2e:test` - Run with both drivers (sequential)

**See:**
- [E2E_TESTING_PLAN.md](./E2E_TESTING_PLAN.md) - 4-layer architecture design
- [E2E_MULTI_DRIVER_PLAN.md](./E2E_MULTI_DRIVER_PLAN.md) - Multi-driver runner plan (next up)

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

## Session Continuity Notes

When resuming work on this project:

1. Run `pnpm quality` to verify all tests pass
2. Check this PLAN.md for current phase and remaining tasks
3. Read recent git commits for implementation context
4. Continue with TDD: write failing test → implement → refactor

The PROJECT_BRIEF.md contains the full design specification. This PLAN.md tracks what's actually built.

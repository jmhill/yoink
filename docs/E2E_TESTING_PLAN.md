# E2E Testing Pipeline Plan

## Overview

This document outlines the implementation of our E2E testing pipeline that properly tests the production artifact before deployment. We use Dave Farley's 4-layer testing architecture to ensure we "test what we ship."

## Implementation Status

**Completed:**
- [x] Separate `packages/acceptance-tests/` package for black-box E2E tests
- [x] Docker-based E2E testing via `pnpm e2e:test`
- [x] CI pipeline: quality → build-artifact → e2e-tests → deploy → smoke-test
- [x] Pre-built Docker image deployed (no remote builds)
- [x] Smoke tests verify health, capture creation, and admin UI

## Problem Statement (Solved)

Our original pipeline had gaps:

1. **Acceptance tests ran against in-process server** - Not the actual Docker container that gets deployed
2. **Docker build issues caught late** - The `@fastify/static` v8/v5 mismatch was only caught when Fly.io tried to start the container
3. **Build happened twice** - Once in `quality` (TypeScript), again in `deploy` (Docker)
4. **No production artifact testing** - We tested the code, not the deployable artifact

## Architecture

### 4-Layer Testing Approach

```
┌─────────────────────────────────────────────────────────────┐
│  Use Cases (what we're testing)                             │
│  "Create a capture", "Login as admin", "List organizations" │
├─────────────────────────────────────────────────────────────┤
│  DSL (readable test language)                               │
│  Test helpers, fixtures, assertions                         │
├─────────────────────────────────────────────────────────────┤
│  Protocol Driver (how we talk to the system)                │
│  HTTP client hitting endpoints                              │
├─────────────────────────────────────────────────────────────┤
│  System Under Test (swappable)                              │
│  ┌─────────────────┐  OR  ┌─────────────────┐              │
│  │ In-process app  │      │ Docker container │              │
│  │ (fast, quality) │      │ (prod artifact)  │              │
│  └─────────────────┘      └─────────────────┘              │
└─────────────────────────────────────────────────────────────┘
```

**Key Insight**: Same tests, same assertions, just swap the bottom layer.

### CI/CD Pipeline

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              CI/CD Pipeline                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────┐    ┌────────────────┐    ┌───────────┐    ┌──────────────┐   │
│  │ quality  │───►│ build-artifact │───►│ e2e-tests │───►│    deploy    │   │
│  └──────────┘    └────────────────┘    └───────────┘    └──────────────┘   │
│       │                  │                   │                  │          │
│       ▼                  ▼                   ▼                  ▼          │
│  • lint               • docker build     • Start container   • fly deploy │
│  • typecheck          • push to Fly.io   • Run acceptance      --image    │
│  • unit tests           registry           tests against it  • smoke test │
│                       • tag with SHA     • Tear down           (minimal)  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Key Design Decision**: Acceptance tests live in a separate `packages/acceptance-tests/` package that:
- Has no dependencies on `@yoink/api` internals
- Uses pure HTTP for all interactions (truly black-box)
- Is excluded from `pnpm quality` (runs only via `e2e:test`)
- Can run against any environment (local container, CI, staging, production)

## Package Structure

### `packages/acceptance-tests/`

The acceptance tests package is completely isolated from the main API:

```
packages/acceptance-tests/
├── src/
│   ├── config.ts              # Environment-based configuration
│   ├── drivers/
│   │   ├── http-client.ts     # Fetch-based HTTP client with cookie jar
│   │   └── index.ts
│   ├── dsl/
│   │   ├── admin.ts           # loginToAdminPanel, logoutAdmin
│   │   ├── tenant.ts          # createTestTenant, TestTenant type
│   │   └── index.ts
│   └── use-cases/
│       ├── admin.test.ts      # Admin API tests
│       ├── captures.test.ts   # Capture API tests
│       └── health.test.ts     # Health endpoint tests
├── package.json
├── tsconfig.json
└── vitest.config.ts
```

### Configuration

Tests require these environment variables:

| Variable | Description | Example |
|----------|-------------|---------|
| `TEST_BASE_URL` | Base URL of system under test | `http://localhost:3333` |
| `TEST_ADMIN_PASSWORD` | Admin panel password | `test-admin-password` |

### Running Tests

```bash
# Run E2E tests locally (starts container, runs tests, cleans up)
pnpm e2e:test

# Run against a custom URL (e.g., staging)
TEST_BASE_URL=https://staging.example.com \
TEST_ADMIN_PASSWORD=staging-password \
pnpm --filter @yoink/acceptance-tests test
```

## Files

### Created
- `packages/acceptance-tests/` - Standalone E2E test package
- `scripts/e2e-test.sh` - E2E test orchestration script

### Modified
- `.github/workflows/ci.yml` - New pipeline structure
- `package.json` - Added `e2e:test` script, quality excludes acceptance-tests
- `docker-compose.test.yml` - Support pre-built images via `IMAGE` env var

### Removed from `apps/api/`
- `src/tests/acceptance/` - Moved to `packages/acceptance-tests/`
- `src/tests/helpers/dsl.ts` - Moved to `packages/acceptance-tests/src/dsl/`

## Design Decisions

### Why a Separate Package?

1. **No build step needed** - Tests don't depend on internal packages
2. **True black-box testing** - Only uses public HTTP APIs
3. **Portable** - Same tests can run against any environment
4. **Fast CI** - Not part of `pnpm quality`, runs only when needed
5. **Extensible** - Can add Playwright for UI tests in the future

### Test Data Isolation

Each test creates its own isolated data:
- `createTestTenant()` creates a unique organization, user, and token
- Tests use their own tenant and don't interfere with each other
- Container state persists across test files within a single run

### Image Registry

We use Fly.io's registry instead of GHCR to avoid cross-registry authentication:
- Build pushes to `registry.fly.io/jhtc-yoink-api:$SHA`
- E2E tests pull from the same registry
- Deploy uses the same tested image

## References

- [Dave Farley - Acceptance Testing](https://www.youtube.com/watch?v=SXbhOqz5hYo)
- [Fly.io Deploy Documentation](https://fly.io/docs/launch/deploy/)

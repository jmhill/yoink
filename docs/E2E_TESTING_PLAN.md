# E2E Testing Pipeline Plan

## Overview

This document outlines the plan to refactor our CI/CD pipeline to properly test the production artifact before deployment. The goal is to implement a "test what you ship" approach using Dave Farley's 4-layer testing architecture.

## Problem Statement

Our current pipeline has gaps:

1. **Acceptance tests run against in-process server** - Not the actual Docker container that gets deployed
2. **Docker build issues caught late** - The `@fastify/static` v8/v5 mismatch was only caught when Fly.io tried to start the container
3. **Build happens twice** - Once in `quality` (TypeScript), again in `deploy` (Docker)
4. **No production artifact testing** - We test the code, not the deployable artifact

## Target Architecture

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

### Target CI/CD Pipeline

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
│  • typecheck          • push to GHCR     • Run acceptance      --image    │
│  • unit tests         • tag with SHA       tests against it  • smoke test │
│  • acceptance tests                      • Tear down           (minimal)  │
│    (in-process)                                                            │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Implementation Tasks

### Phase 1: Refactor Test Infrastructure

#### 1.1 Modify `createTestApp()` to Support External Target

**File**: `apps/api/src/tests/helpers/test-app.ts`

Add environment variable detection:

```typescript
// If TEST_BASE_URL is set, return a client pointing at that URL
// Otherwise, spin up the in-process server as before

export const createTestApp = async (options?: TestAppOptions) => {
  const baseUrl = process.env.TEST_BASE_URL;
  
  if (baseUrl) {
    // External container mode - just return HTTP client
    return {
      client: createHttpClient(baseUrl),
      cleanup: async () => {}, // No cleanup needed
      // Expose seeded credentials for auth
      seedToken: process.env.TEST_SEED_TOKEN,
      adminPassword: process.env.TEST_ADMIN_PASSWORD,
    };
  }
  
  // In-process mode - existing behavior
  // ...
};
```

**Considerations**:
- Need to handle seeding differently - container uses env vars, in-process uses test fixtures
- Some tests may need adjustment if they rely on direct database access
- Auth credentials need to be passed through env vars for container mode

#### 1.2 Update Acceptance Tests for Dual-Mode Support

**Files**: `apps/api/src/tests/acceptance/*.test.ts`

Most tests should work unchanged since they use HTTP client. Review for:
- Direct database access (won't work in container mode)
- Hardcoded credentials (need to use env vars)
- Test isolation assumptions (container has persistent state within test run)

### Phase 2: Docker Compose Updates

#### 2.1 Update `docker-compose.test.yml`

```yaml
services:
  api:
    image: ${IMAGE:-}
    build:
      context: .
      dockerfile: apps/api/Dockerfile
    environment:
      - ADMIN_PASSWORD=test-admin-password
      - SESSION_SECRET=test-session-secret-min-32-chars-long
      - SKIP_LITESTREAM=true
      - DB_PATH=/app/apps/api/data/captures.db
      - SEED_TOKEN=test-seed-token-secret
    ports:
      - "3333:3000"
    healthcheck:
      test: ["CMD", "wget", "-q", "--spider", "http://localhost:3000/health"]
      interval: 2s
      timeout: 5s
      retries: 10
```

#### 2.2 Create `scripts/e2e-test.sh`

```bash
#!/bin/bash
set -e

COMPOSE_FILE="docker-compose.test.yml"
HEALTH_URL="http://localhost:3333/health"

cleanup() {
    docker compose -f "$COMPOSE_FILE" down --volumes --remove-orphans 2>/dev/null || true
}
trap cleanup EXIT

# Start container
docker compose -f "$COMPOSE_FILE" up --build -d

# Wait for health
# ... (retry logic)

# Run acceptance tests against container
TEST_BASE_URL="http://localhost:3333" \
TEST_SEED_TOKEN="<tokenId>:test-seed-token-secret" \
TEST_ADMIN_PASSWORD="test-admin-password" \
pnpm --filter @yoink/api test:acceptance

echo "==> E2E tests passed!"
```

#### 2.3 Add npm Scripts

**File**: `package.json` (root)

```json
{
  "scripts": {
    "e2e:test": "./scripts/e2e-test.sh"
  }
}
```

**File**: `apps/api/package.json`

```json
{
  "scripts": {
    "test:acceptance": "vitest run --config vitest.acceptance.config.ts"
  }
}
```

### Phase 3: CI/CD Pipeline Updates

#### 3.1 Update GitHub Actions Workflow

**File**: `.github/workflows/ci.yml`

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  quality:
    name: Quality Checks
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: jetify-com/devbox-install-action@v0.14.0
      - run: devbox run pnpm install --frozen-lockfile
      - run: devbox run pnpm quality

  build-artifact:
    name: Build Docker Image
    runs-on: ubuntu-latest
    needs: quality
    permissions:
      contents: read
      packages: write
    steps:
      - uses: actions/checkout@v4
      
      - name: Log in to GitHub Container Registry
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      
      - name: Build and push Docker image
        uses: docker/build-push-action@v5
        with:
          context: .
          file: apps/api/Dockerfile
          push: true
          tags: |
            ghcr.io/${{ github.repository }}:${{ github.sha }}
            ghcr.io/${{ github.repository }}:latest

  e2e-tests:
    name: E2E Tests
    runs-on: ubuntu-latest
    needs: build-artifact
    steps:
      - uses: actions/checkout@v4
      
      - name: Log in to GitHub Container Registry
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      
      - name: Pull pre-built image
        run: docker pull ghcr.io/${{ github.repository }}:${{ github.sha }}
      
      - name: Run E2E tests
        run: |
          # Use pre-built image instead of building
          IMAGE=ghcr.io/${{ github.repository }}:${{ github.sha }} \
          ./scripts/e2e-test.sh

  deploy:
    name: Deploy to Fly.io
    runs-on: ubuntu-latest
    needs: e2e-tests
    if: github.ref == 'refs/heads/main' && github.event_name == 'push'
    steps:
      - uses: actions/checkout@v4
      - uses: superfly/flyctl-actions/setup-flyctl@master
      
      - name: Deploy pre-built image
        run: flyctl deploy --image ghcr.io/${{ github.repository }}:${{ github.sha }} --config apps/api/fly.toml
        env:
          FLY_API_TOKEN: ${{ secrets.FLY_API_TOKEN }}

  smoke-test:
    name: Production Smoke Test
    runs-on: ubuntu-latest
    needs: deploy
    if: github.ref == 'refs/heads/main' && github.event_name == 'push'
    steps:
      - name: Health check
        run: |
          curl -sf https://jhtc-yoink-api.fly.dev/health
      
      - name: Create test capture
        env:
          SMOKE_TEST_TOKEN: ${{ secrets.SMOKE_TEST_TOKEN }}
        run: |
          # Skip if token not configured
          if [ -z "$SMOKE_TEST_TOKEN" ]; then
            echo "SMOKE_TEST_TOKEN not configured - skipping"
            exit 0
          fi
          
          curl -sf -X POST https://jhtc-yoink-api.fly.dev/captures \
            -H "Authorization: Bearer $SMOKE_TEST_TOKEN" \
            -H "Content-Type: application/json" \
            -d '{"content": "Smoke test", "sourceApp": "github-actions"}'
      
      - name: Verify admin UI reachable
        run: |
          curl -sf https://jhtc-yoink-api.fly.dev/admin/ | grep -q "<!DOCTYPE html>"
```

#### 3.2 Update `docker-compose.test.yml` for Pre-built Image Support

```yaml
services:
  api:
    image: ${IMAGE:-}
    build:
      context: .
      dockerfile: apps/api/Dockerfile
    # ... rest unchanged
```

When `IMAGE` is set, use that; otherwise build from Dockerfile (for local dev).

### Phase 4: Fly.io Configuration

#### 4.1 Update `fly.toml`

Remove the `[build]` section since we're deploying pre-built images:

```toml
app = "jhtc-yoink-api"
primary_region = "ord"

# Remove [build] section - we deploy pre-built images

[http_service]
  internal_port = 3000
  # ... rest unchanged
```

## Files to Create/Modify

### New Files
- `docs/E2E_TESTING_PLAN.md` - This document
- `scripts/e2e-test.sh` - E2E test orchestration script (replaces `docker-test.sh`)
- `apps/api/vitest.acceptance.config.ts` - Separate config for acceptance tests (optional)

### Modified Files
- `apps/api/src/tests/helpers/test-app.ts` - Add external target support
- `docker-compose.test.yml` - Support pre-built images, add seed token
- `.github/workflows/ci.yml` - New pipeline structure
- `apps/api/fly.toml` - Remove build section
- `package.json` - Add `e2e:test` script, remove `docker:test`
- `docs/PLAN.md` - Reference this plan

### Removed Files
- `scripts/docker-test.sh` - Replaced by `e2e-test.sh`

## Migration Strategy

1. **Phase 1**: Implement test infrastructure changes without breaking existing tests
2. **Phase 2**: Add new CI jobs alongside existing ones (run both)
3. **Phase 3**: Verify new pipeline works, remove old jobs
4. **Phase 4**: Update documentation

## Success Criteria

- [ ] `pnpm quality` runs fast (~3-5s with cache, includes in-process acceptance tests)
- [ ] `pnpm e2e:test` works locally (builds Docker, runs acceptance tests against it)
- [ ] CI pipeline: quality -> build -> e2e -> deploy -> smoke-test
- [ ] Same acceptance tests run in both modes
- [ ] Deploy uses pre-built, tested image (no remote build)
- [ ] Smoke test verifies: health, capture creation, admin UI reachable

## Open Questions

1. **Test data isolation**: Should each test file get a fresh container, or one container for all tests?
   - Recommendation: One container per `e2e:test` run, tests must be independent

2. **Seed token format**: The container needs to output the seeded token in a predictable format so the test script can capture it.
   - Recommendation: Log format `Seeded API token: <tokenId>:<secret>` and parse it

3. **GHCR image retention**: How long to keep old images?
   - Recommendation: GitHub's default retention policy, or configure lifecycle rules

## References

- [Dave Farley - Acceptance Testing](https://www.youtube.com/watch?v=SXbhOqz5hYo)
- [Fly.io Deploy Documentation](https://fly.io/docs/launch/deploy/)
- [GitHub Container Registry](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry)

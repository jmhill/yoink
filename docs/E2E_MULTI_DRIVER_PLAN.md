# E2E Multi-Driver Test Runner Plan

This document outlines the plan to overhaul the E2E test infrastructure to support running tests against multiple drivers (HTTP + Playwright) in a single test execution, with unified reporting.

## Problem Statement

### Current Issues

1. **Single driver per run**: The test harness reads `DRIVER` env var to select ONE driver at runtime
2. **Sequential execution**: Running `DRIVER=all` executes tests twice as separate vitest processes
3. **No unified reporting**: The report generator only sees results from the last run
4. **CI only runs HTTP**: The GitHub Actions workflow doesn't run Playwright tests
5. **Playwright driver doesn't actually test UI**: The `AnonymousActor` makes assumptions instead of verifying behavior; the `Actor` tracks state locally instead of verifying UI state

### Desired State

1. Single vitest execution runs each test against ALL applicable drivers
2. Test names include driver suffix: `can create a capture [http]`, `can create a capture [playwright]`
3. Unified markdown table output showing pass/fail/N/A per test per driver
4. CI runs both HTTP and Playwright drivers
5. Playwright driver properly tests UI behavior

---

## Part 1: Refactor Test Harness

### Current Architecture

```typescript
// harness.ts - current
describeFeature('Capturing notes', ['http', 'playwright'], ({ createActor }) => {
  it('can create a capture', async () => {
    const alice = await createActor('alice@example.com');
    // ...
  });
});
```

Currently:
- Reads `DRIVER` env var to pick ONE driver
- Skips the entire describe block if driver doesn't match capabilities

### New Architecture

The harness will:
1. Initialize ALL drivers at startup (http + playwright)
2. For each `describeFeature`, create nested describe blocks per applicable driver
3. Each `it` becomes `it('test name [driverName]', ...)`

**New test output structure:**
```
Capturing notes
  ├── [http]
  │   ├── ✓ can create a capture [http]
  │   ├── ✓ requires authentication [http]
  │   └── ...
  └── [playwright]
      ├── ✓ can create a capture [playwright]
      ├── ✓ requires authentication [playwright]
      └── ...

Capturing notes - API features
  └── [http]
      ├── ✓ includes user and org info in capture [http]
      └── ...
```

### Implementation Approach

Pass `it` through the context instead of importing from harness:

**Before:**
```typescript
import { describeFeature, it, expect, beforeEach } from './harness.js';

describeFeature('Capturing notes', ['http', 'playwright'], ({ createActor }) => {
  it('can create a capture', async () => { ... });
});
```

**After:**
```typescript
import { describeFeature, expect, beforeEach } from './harness.js';

describeFeature('Capturing notes', ['http', 'playwright'], ({ createActor, it }) => {
  it('can create a capture', async () => { ... });
});
```

The only change to test files is: `it` comes from context instead of import.

### Harness Implementation Details

```typescript
// Pseudo-code for new harness.ts

type DriverInstances = Map<DriverCapability, Driver>;

let drivers: DriverInstances;

// Initialize all drivers once before any tests
beforeAll(async () => {
  const config = getTestConfig();
  drivers = new Map();
  drivers.set('http', createHttpDriver(config));
  drivers.set('playwright', createPlaywrightDriver(config));
  
  for (const driver of drivers.values()) {
    await driver.setup();
  }
});

afterAll(async () => {
  for (const driver of drivers.values()) {
    await driver.teardown();
  }
});

export const describeFeature = (
  name: string,
  supportedDrivers: DriverCapability[],
  fn: (context: TestContext) => void
): void => {
  vitestDescribe(name, () => {
    for (const driverName of supportedDrivers) {
      vitestDescribe(`[${driverName}]`, () => {
        const driver = drivers.get(driverName)!;
        
        // Custom `it` that appends driver name
        const it = (testName: string, testFn: () => Promise<void>) => {
          vitestIt(`${testName} [${driverName}]`, testFn);
        };
        
        const context: TestContext = {
          driver,
          driverName,
          admin: driver.admin,
          health: driver.health,
          createActor: (email) => driver.createActor(email),
          createAnonymousActor: () => driver.createAnonymousActor(),
          it, // Pass custom `it` through context
        };
        
        fn(context);
      });
    }
  });
};
```

---

## Part 2: Custom Vitest Reporter

Create `packages/acceptance-tests/src/reporter.ts` that outputs a markdown table.

### Report Format

Single table with all tests:

```markdown
## Acceptance Test Results

| Test | http | playwright |
|------|------|------------|
| Capturing notes > can create a capture | ✅ | ✅ |
| Capturing notes > requires authentication | ✅ | ✅ |
| Capturing notes > can add metadata | ✅ | N/A |
| Organizing work > can archive | ✅ | ✅ |
| System health > reports healthy | ✅ | ✅ |

**Total: 42 passed, 0 failed**
```

### Implementation Details

The reporter will:
1. Parse test names to extract `[driverName]` suffix
2. Group by base test name (without driver suffix)
3. Track pass/fail/skip per driver
4. Output markdown at end of run
5. Write to `test-report.md` for CI step summary consumption

### Vitest Config Changes

```typescript
// vitest.config.ts
export default defineConfig({
  test: {
    include: ['src/use-cases/**/*.test.ts'],
    reporters: ['default', './src/reporter.ts'],
    outputFile: {
      json: './test-results.json',
    },
  },
});
```

---

## Part 3: Fix Playwright Driver

### Issue 1: AnonymousActor Doesn't Test

**Current (broken):**
```typescript
async createCapture(_input: CreateCaptureInput): Promise<Capture> {
  await page.goto('/');
  const url = page.url();
  if (url.includes('/config')) {
    throw new UnauthorizedError();
  }
  throw new UnauthorizedError(); // Always throws anyway!
}
```

**Fixed:**
```typescript
async createCapture(_input: CreateCaptureInput): Promise<Capture> {
  // Clear any existing token to ensure we're truly anonymous
  await page.evaluate(() => localStorage.removeItem('yoink_api_token'));
  
  // Navigate to the app root
  await page.goto('/');
  
  // The app should redirect to /config because no token is set
  await page.waitForURL('**/config', { timeout: 5000 });
  
  // We successfully got redirected, meaning auth is enforced
  throw new UnauthorizedError();
}
```

### Issue 2: Actor Tracks State Locally

**Current issues:**
- Tracks captures in local Map instead of verifying UI
- `getCapture(id)` looks up in local Map (doesn't verify UI)
- `updateCapture` with content change updates local state but UI has no edit feature

**Fixed approach:**

For operations the UI supports (create, list, archive, unarchive):
- Actually perform the action via UI
- Verify the result in the UI (content appears/disappears from list)
- Return result based on actual UI state

For operations the UI doesn't support (get by ID, update content, add title):
- These tests are already marked HTTP-only
- Actor won't be called for these operations

**Key fixes:**

1. **`createCapture`**: Verify content appears in list after adding
2. **`listCaptures`**: Read actual contents from UI, not local state
3. **`archiveCapture`**: Click archive button AND verify content disappears from inbox
4. **`unarchiveCapture`**: Navigate to archived, click unarchive, verify content moves to inbox
5. **`getCapture`**: HTTP-only (no detail page in UI) - current local lookup is acceptable
6. **`updateCapture`**: Status changes use archive/unarchive; content/title changes are HTTP-only

### Page Object Improvements

Use text and role selectors (not data-testid) for more realistic user-centric testing:

```typescript
async quickAdd(content: string): Promise<void> {
  const input = this.page.getByPlaceholder('Quick capture...');
  await input.fill(content);
  
  const addButton = this.page.getByRole('button', { name: 'Add' });
  await addButton.click();
  
  // Wait for the content to appear in the list
  await this.page.getByText(content).waitFor();
}
```

---

## Part 4: Infrastructure Changes

### Simplify e2e-test.sh

Remove driver selection logic entirely:

```bash
#!/bin/bash
set -e

COMPOSE_FILE="docker-compose.test.yml"
HEALTH_URL="http://localhost:3333/api/health"
MAX_RETRIES=30
RETRY_INTERVAL=2

TEST_BASE_URL="http://localhost:3333"
TEST_ADMIN_PASSWORD="test-admin-password"

cleanup() {
    echo "==> Cleaning up..."
    docker compose -f "$COMPOSE_FILE" down --volumes --remove-orphans 2>/dev/null || true
}

trap cleanup EXIT

echo "==> Starting Docker container..."
if [ -n "$IMAGE" ]; then
    echo "    Using pre-built image: $IMAGE"
    docker compose -f "$COMPOSE_FILE" up -d
else
    echo "    Building from Dockerfile..."
    docker compose -f "$COMPOSE_FILE" up --build -d
fi

echo "==> Waiting for health endpoint..."
for i in $(seq 1 $MAX_RETRIES); do
    if curl -sf "$HEALTH_URL" > /dev/null 2>&1; then
        echo "==> Health check passed!"
        break
    fi
    
    if [ "$i" -eq "$MAX_RETRIES" ]; then
        echo "==> Health check failed after $MAX_RETRIES attempts"
        docker compose -f "$COMPOSE_FILE" logs
        exit 1
    fi
    
    echo "    Attempt $i/$MAX_RETRIES - waiting ${RETRY_INTERVAL}s..."
    sleep $RETRY_INTERVAL
done

echo "==> Running acceptance tests..."
TEST_BASE_URL="$TEST_BASE_URL" \
TEST_ADMIN_PASSWORD="$TEST_ADMIN_PASSWORD" \
pnpm --filter @yoink/acceptance-tests test

echo "==> Tests complete!"
```

No more `DRIVER` env var, no inline report generation (reporter handles it).

### Update CI Workflow

```yaml
- name: Install Playwright browsers
  run: devbox run pnpm --filter @yoink/acceptance-tests exec playwright install chromium

- name: Run E2E tests
  run: |
    IMAGE=registry.fly.io/jhtc-yoink-api:${{ github.sha }} \
    devbox run ./scripts/e2e-test.sh

- name: Generate Feature Report
  if: always()
  run: |
    if [ -f "packages/acceptance-tests/test-report.md" ]; then
      cat packages/acceptance-tests/test-report.md >> $GITHUB_STEP_SUMMARY
    fi
```

Remove the existing inline Node.js report generation since the custom reporter handles it.

---

## Part 5: Files to Modify

| File | Changes |
|------|---------|
| `packages/acceptance-tests/src/use-cases/harness.ts` | Multi-driver execution logic, pass `it` through context |
| `packages/acceptance-tests/src/reporter.ts` | **New** - Custom markdown reporter |
| `packages/acceptance-tests/vitest.config.ts` | Use custom reporter |
| `packages/acceptance-tests/src/drivers/playwright/actor.ts` | Fix AnonymousActor, improve Actor verification |
| `packages/acceptance-tests/src/drivers/playwright/page-objects.ts` | Improve waiting/selectors |
| `packages/acceptance-tests/src/drivers/playwright/index.ts` | Minor fixes if needed |
| `packages/acceptance-tests/src/use-cases/*.test.ts` | Get `it` from context instead of import |
| `scripts/e2e-test.sh` | Simplify (remove driver logic, remove report generation) |
| `.github/workflows/ci.yml` | Add Playwright install, use report file, remove inline report |

---

## Implementation Order

### Phase 1: Fix Playwright Driver (Prerequisite) - COMPLETE

Must fix the driver before testing harness changes.

1. ~~Fix `AnonymousActor` to properly test redirect behavior~~
2. ~~Fix `Actor` to verify UI state after actions~~ (existing implementation was correct)
3. ~~Improve page object waiting strategies~~ (existing implementation was correct)
4. ~~Verify fixes work: `DRIVER=playwright pnpm e2e:test`~~

**Changes made:**
- Refactored `AnonymousActor` to use `ensureRedirectsToConfig()` helper that:
  - Clears localStorage token to ensure truly anonymous state
  - Uses `waitForURL('**/config')` to verify redirect actually happens
  - Throws `UnauthorizedError` only after successful redirect verification
- The `Actor` implementation was already correctly verifying UI state via page objects

### Phase 2: Refactor Test Harness

1. Update `harness.ts` with new multi-driver logic
2. Update test files to get `it` from context
3. Create custom reporter
4. Update `vitest.config.ts`
5. Test locally: verify both drivers execute in single run

### Phase 3: Update Infrastructure

1. Simplify `e2e-test.sh`
2. Update CI workflow:
   - Add Playwright browser installation
   - Remove inline report generation
   - Use report file for step summary
3. Verify CI passes via PR

---

## Success Criteria

1. Running `pnpm e2e:test` executes all tests against both HTTP and Playwright drivers in a single vitest run
2. Test output shows driver in test name: `can create a capture [http]`
3. Markdown report shows unified table with all tests and both drivers
4. CI runs both drivers and shows report in step summary
5. Playwright tests actually verify UI behavior (not just assumptions)

---

## Related Documents

- [E2E_TESTING_PLAN.md](./E2E_TESTING_PLAN.md) - Original 4-layer architecture design
- [TESTING_STRATEGY.md](./TESTING_STRATEGY.md) - Overall testing philosophy
- [PLAN.md](./PLAN.md) - Project implementation plan

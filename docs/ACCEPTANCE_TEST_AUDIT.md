# Acceptance Test Audit

This document captures findings from a comprehensive review of the acceptance testing setup, along with recommendations for improvement.

## Audit Summary

| Area | Status | Notes |
|------|--------|-------|
| Test descriptions | Excellent | All 58 tests use business-oriented language |
| DSL-only usage | 82% compliant | 2 files violate by importing drivers directly |
| HTTP driver | Excellent | Clean separation, no logic leakage |
| Playwright driver | Good | Some concerns with validation logic and synthetic state |
| Driver abstraction | Good | Works well, but Actor interface mixes abstraction levels |

---

## Findings

### 1. DSL Violations in Use-Cases

Two test files import driver implementations directly, violating the 4-layer architecture:

**`authenticating.test.ts`**
```typescript
import { createHttpAdmin } from '../drivers/http/admin.js';
import { createHttpClient } from '../drivers/http/http-client.js';

// Used to test wrong password scenario
const wrongPasswordAdmin = createHttpAdmin(client, 'wrong-password-123');
```

**`token-security.test.ts`**
```typescript
import { createHttpActor } from '../drivers/http/actor.js';
import { createHttpClient } from '../drivers/http/http-client.js';

// Used to test invalid/revoked tokens
const actor = createHttpActor(client, { ...invalidTokenConfig });
```

**Impact**: These tests are coupled to HTTP transport and cannot run against Playwright.

**Recommendation**: Extend the harness to support these scenarios:
- Add `harness.createAdminWithCredentials(password)` for auth tests
- Add `harness.createActorWithToken(token)` for token security tests

---

### 2. Playwright Driver Concerns

#### Validation Logic in Driver

The Playwright driver pre-validates input rather than letting the UI demonstrate validation:

```typescript
// actor.ts:74-77
async createCapture(input: CreateCaptureInput): Promise<Capture> {
  if (!input.content || input.content.trim() === '') {
    throw new ValidationError('Content is required');
  }
  // ...
}
```

**Recommendation**: Remove validation from driver. Let the UI show validation errors, then have the driver detect and translate those errors.

#### Synthetic ID Tracking

The driver maintains a `capturesByContent` Map to track IDs because the UI doesn't expose them:

```typescript
const capturesByContent = new Map<string, CaptureState>();

// Creates fake IDs for tracking
const state: CaptureState = {
  id: `ui-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  // ...
};
```

**Impact**: `getCapture(id)` only works for captures the driver created. Creates semantic drift from actual system behavior.

**Recommendation**: Consider alternatives:
- Use content-based lookups consistently
- Expose a test-only API endpoint to retrieve real IDs
- Accept this limitation and document it clearly

#### Magic Timeouts

Hardcoded `waitForTimeout` calls are fragile:

```typescript
await page.waitForTimeout(100);  // Multiple locations
await page.waitForTimeout(500);
```

**Recommendation**: Replace with explicit wait conditions:
```typescript
await page.waitForSelector('[data-testid="capture-list"]');
await page.waitForResponse((r) => r.url().includes('/api/captures'));
```

#### Silent Error Swallowing

```typescript
const hasOfflinePlaceholder = await offlineInput.isVisible().catch(() => false);
```

**Recommendation**: Handle errors explicitly or at minimum log unexpected failures.

---

### 3. Mixed Abstraction Levels in Actor Interface

The `Actor` interface combines API-level and browser-specific operations:

| API-level (all drivers) | Browser-only (Playwright) |
|-------------------------|---------------------------|
| `createCapture()` | `goToSettings()` |
| `listCaptures()` | `logout()` |
| `archiveCapture()` | `goOffline()` |
| `pinCapture()` | `isOfflineBannerVisible()` |

The HTTP driver throws `UnsupportedOperationError` for browser-only methods. This works but provides runtime errors instead of compile-time safety.

**Recommendation**: Split interfaces and use type narrowing (see next section).

---

## Proposed Interface Split

### Split Actor into Core and Browser Interfaces

```typescript
// Core operations - all drivers implement
type CoreActor = {
  readonly email: string;
  readonly userId: string;
  readonly organizationId: string;

  createCapture(input: CreateCaptureInput): Promise<Capture>;
  listCaptures(): Promise<Capture[]>;
  getCapture(id: string): Promise<Capture>;
  updateCapture(id: string, input: UpdateCaptureInput): Promise<Capture>;
  archiveCapture(id: string): Promise<Capture>;
  unarchiveCapture(id: string): Promise<Capture>;
  pinCapture(id: string): Promise<Capture>;
  unpinCapture(id: string): Promise<Capture>;
  snoozeCapture(id: string, until: string): Promise<Capture>;
  unsnoozeCapture(id: string): Promise<Capture>;
  listArchivedCaptures(): Promise<Capture[]>;
  listSnoozedCaptures(): Promise<Capture[]>;
};

// Browser-specific operations - only Playwright implements
type BrowserActor = CoreActor & {
  goToSettings(): Promise<void>;
  logout(): Promise<void>;
  requiresConfiguration(): Promise<boolean>;
  shareContent(params: ShareParams): Promise<Capture>;
  goOffline(): Promise<void>;
  goOnline(): Promise<void>;
  isOfflineBannerVisible(): Promise<boolean>;
  isQuickAddDisabled(): Promise<boolean>;
};
```

### Type-Safe Driver Selection with Overloads

Use function overloads to narrow the context type based on the driver:

```typescript
// Overloaded signatures narrow return type based on driver
function setupDriver(driver: 'playwright'): PlaywrightContext;
function setupDriver(driver: 'http'): HttpContext;
function setupDriver(driver: DriverCapability): DriverContext;

type PlaywrightContext = {
  createActor: (email: string) => Promise<BrowserActor>;
  createAnonymousActor: () => AnonymousActor;
  admin: Admin;
  health: Health;
};

type HttpContext = {
  createActor: (email: string) => Promise<CoreActor>;
  createAnonymousActor: () => AnonymousActor;
  admin: Admin;
  health: Health;
};
```

### Simplified Test Pattern

Replace the complex `describeFeature` with `usingDrivers` - a thin wrapper that handles setup/teardown:

```typescript
// Browser-only test - TypeScript knows ctx.createActor returns BrowserActor
usingDrivers(['playwright'] as const, (ctx) => {
  describe(`Session management [${ctx.driverName}]`, () => {
    it('can logout', async () => {
      const alice = await ctx.createActor('alice@example.com');
      await alice.logout();  // TypeScript knows this exists
    });
  });
});

// Multi-driver test - TypeScript knows ctx.createActor returns CoreActor
usingDrivers(['http', 'playwright'] as const, (ctx) => {
  describe(`Capturing notes [${ctx.driverName}]`, () => {
    it('can create capture', async () => {
      const alice = await ctx.createActor('alice@example.com');
      await alice.createCapture({ content: 'Test' });  // OK
      await alice.logout();  // Error - not on CoreActor
    });
  });
});

// HTTP-only test - TypeScript knows ctx has createActorWithCredentials
usingDrivers(['http'] as const, (ctx) => {
  describe(`Token security [${ctx.driverName}]`, () => {
    it('rejects invalid tokens', async () => {
      const actor = ctx.createActorWithCredentials({ token: 'invalid', ... });
      await expect(actor.listCaptures()).rejects.toThrow(UnauthorizedError);
    });
  });
});
```

### Why This Works

1. **`as const`** preserves the literal type of the driver array
2. **Function overloads** narrow the return type based on the driver literal
3. **Single driver** (`'playwright'`) matches the specific overload, returns `PlaywrightContext`
4. **Union of drivers** (`'http' | 'playwright'`) falls back to base overload, returns `DriverContext` with `CoreActor`

### Adding More Drivers

Add more overloads as needed:

```typescript
function setupDriver(driver: 'playwright'): PlaywrightContext;
function setupDriver(driver: 'mobile'): MobileContext;
function setupDriver(driver: 'http'): HttpContext;
function setupDriver(driver: 'direct'): DirectContext;
function setupDriver(driver: DriverCapability): DriverContext;
```

Each single-driver test gets its specific type. Multi-driver tests get the common subset.

---

## Test Isolation Improvements

### Current Approach

Each `createActor()` call creates a new organization, user, and token. This provides good isolation but has issues:

1. **No cleanup**: Orphaned tenants accumulate in the database
2. **Shared BrowserContext**: Playwright actors share a browser context (potential cookie cross-contamination)

### Recommendations

1. **Add tenant cleanup in teardown**:
   ```typescript
   afterAll(async () => {
     await admin.deleteOrganization(orgId);
   });
   ```

2. **Consider isolated browser contexts per actor** for stricter Playwright isolation

---

## Summary of Recommendations

| Priority | Recommendation | Status |
|----------|----------------|--------|
| High | Fix DSL violations in `authenticating.test.ts` and `token-security.test.ts` | ✅ Done |
| High | Remove validation logic from Playwright driver | Pending |
| Medium | Split Actor into CoreActor + BrowserActor | ✅ Done |
| Medium | Replace `describeFeature` with `usingDrivers` pattern | ✅ Done |
| Medium | Replace magic timeouts with explicit wait conditions | Pending |
| Low | Add tenant cleanup in test teardown | Pending |
| Low | Consider isolated browser contexts per actor | Pending |

## Implementation Notes

### Completed Items

**DSL Violations Fixed**

Both `authenticating.test.ts` and `token-security.test.ts` now use the `usingDrivers` helper with `['http'] as const` to get `HttpContext`, which provides:

- `createAdminWithCredentials(password)` - Create an Admin with a specific password for testing wrong credentials
- `createActorWithCredentials(credentials)` - Create an actor with pre-existing credentials for testing revoked/invalid tokens

**Actor Interface Split**

The `Actor` type has been split into:

- `CoreActor` - Operations available in all drivers (capture CRUD, listing, etc.)
- `BrowserActorOperations` - Browser-only operations (offline, sharing, settings, logout)
- `BrowserActor` - `CoreActor & BrowserActorOperations`
- `Actor` - Kept as alias to `BrowserActor` for backwards compatibility

**New `usingDrivers` Helper**

A single function with TypeScript overloads provides type-safe contexts:

```typescript
// Overload signatures narrow the context type based on drivers
function usingDrivers(drivers: readonly ['http'], fn: (ctx: HttpContext) => void): void;
function usingDrivers(drivers: readonly ['playwright'], fn: (ctx: PlaywrightContext) => void): void;
function usingDrivers<T extends readonly DriverCapability[]>(drivers: T, fn: (ctx: BaseContext) => void): void;
```

Context types:
- `HttpContext` - Includes `createAdminWithCredentials`, `createActorWithCredentials`, returns `CoreActor`
- `PlaywrightContext` - Returns `BrowserActor` with browser-specific operations
- `BaseContext` - Common operations, returns `CoreActor` (used for multi-driver tests)

All contexts include `ctx.driverName` for including driver info in test names.

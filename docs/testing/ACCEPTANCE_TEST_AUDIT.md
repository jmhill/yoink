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

~~The Playwright driver pre-validates input rather than letting the UI demonstrate validation.~~

**Status**: ✅ Fixed

The driver now attempts the UI action and detects if the Add button is disabled (which indicates validation failure). The `quickAdd` page object method returns `false` when submission is prevented, allowing the driver to translate this into a `ValidationError`.

#### Synthetic ID Tracking

~~The driver maintained a `capturesByContent` Map to track synthetic IDs because the UI didn't expose them.~~

**Status**: ✅ Fixed

The web UI now exposes real capture IDs via `data-capture-id` attributes on capture cards. The Playwright driver reads these IDs directly from the DOM, eliminating the need for synthetic ID tracking entirely.

Changes made:
1. Added `data-capture-id={capture.id}` to Card components in inbox, archived, and snoozed pages
2. Updated page objects to read IDs via `getAttribute('data-capture-id')`
3. Removed `capturesByContent` Map and `CaptureState` type from the actor
4. The `quickAdd` method now returns the real capture ID from the DOM

This means the Playwright driver now uses real database IDs, matching the HTTP driver's behavior exactly.

#### Magic Timeouts

~~Hardcoded `waitForTimeout` calls are fragile.~~

**Status**: ✅ Fixed

All magic timeouts have been replaced with explicit wait conditions:

- `listCaptures`, `listArchivedCaptures`, `listSnoozedCaptures`: Now use `waitForCapturesOrEmpty()` which waits for either capture cards or empty state message
- `requiresConfiguration`: Now uses `waitForURL('**/config')` with a timeout
- `isOfflineBannerVisible`: Now uses `banner.waitFor({ state: 'visible' })` with a timeout
- `isQuickAddDisabled`: Now uses `offlineInput.waitFor({ state: 'visible' })` with a timeout

The page objects (`InboxPage`, `ArchivedPage`, `SnoozedPage`) now expose `waitForCapturesOrEmpty()` methods that use `Promise.race()` to wait for one of multiple possible states.

#### Silent Error Swallowing

~~The `isQuickAddDisabled` method caught all errors and converted them to `false`, hiding potential issues.~~

**Status**: ✅ Fixed

The method now uses explicit `waitFor()` with a timeout, then falls through to a direct `isDisabled()` check. Errors that occur during the direct check will now propagate rather than being silently swallowed.

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
| High | Remove validation logic from Playwright driver | ✅ Done |
| Medium | Split Actor into CoreActor + BrowserActor | ✅ Done |
| Medium | Replace `describeFeature` with `usingDrivers` pattern | ✅ Done |
| Medium | Replace magic timeouts with explicit wait conditions | ✅ Done |
| Medium | Fix silent error swallowing in offline detection | ✅ Done |
| Low | Expose real IDs in DOM (replaces synthetic ID tracking) | ✅ Done |
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

**Playwright Driver Cleanup**

The Playwright driver has been cleaned up to remove test logic from the driver layer:

1. **Validation Logic Removed**: The `createCapture` method no longer pre-validates content. Instead, the `quickAdd` page object returns `false` when the UI prevents submission (disabled Add button), and the driver translates this to `ValidationError`.

2. **Magic Timeouts Replaced**: All `waitForTimeout()` calls replaced with explicit wait conditions:
   - Page objects now have `waitForCapturesOrEmpty()` methods using `Promise.race()`
   - `requiresConfiguration` uses `waitForURL()` with timeout
   - Offline detection uses element-specific `waitFor()` with timeout

3. **Error Swallowing Fixed**: The `isQuickAddDisabled` method now properly propagates errors instead of catching and returning `false`.

4. **Real IDs from DOM**: The web UI now exposes `data-capture-id` attributes on capture cards. The Playwright driver reads these real database IDs directly from the DOM, eliminating synthetic ID tracking entirely. This makes the Playwright driver's behavior match the HTTP driver exactly.

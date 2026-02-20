# Plan: Revive Composition Testing with `createTestApp()`

## Goal

Establish composition tests that verify the real app wiring works—catching DI bugs, middleware ordering issues, and plugin registration problems that unit tests with manual wiring cannot detect.

## Current State

| File | Status | Purpose |
|------|--------|---------|
| `apps/api/src/tests/helpers/test-app.ts` | **Unused** | Factory functions ready to use |
| `apps/api/src/composition-root.test.ts` | 2 basic tests | Boot smoke tests |
| `apps/api/src/security.test.ts` | **300 lines, actively used** | Rate limiting + security headers via composition |

**Key insight**: `security.test.ts` already demonstrates the correct pattern. The infrastructure exists—we just need to expand coverage and actually use `createTestApp()`.

**Reality check**: the seeded token ID is the *second* sequential UUID because `seedAuthData` generates a membership ID first, then the token ID. Tests should use token ID `...0002`.

## Implementation Plan

### Phase 1: Enhance `test-app.ts` Helper

**File**: `apps/api/src/tests/helpers/test-app.ts`

Add:
1. Export `testConfig` for tests that need to customize it
2. Fix `TEST_TOKEN` to match seeded token ID order (membership ID first, token ID second)
3. `testConfigWithWebAuthn` — config with valid WebAuthn settings (mirror `security.test.ts`)
4. `createTestAppWithWebAuthn()` — enables WebAuthn/session auth for session testing
5. `createTestAppFull()` — admin + WebAuthn enabled

```typescript
// New exports
export const testConfig: AppConfig = { /* existing */ };
export const testConfigWithWebAuthn: AppConfig = { /* existing + webauthn */ };
export const createTestAppWithWebAuthn = async () => { /* ... */ };
export const createTestAppFull = async () => { /* ... */ };
```

### Phase 2: Create Composition Test Directory

**New directory**: `apps/api/src/tests/composition/`

Note: this is an intentional exception to colocated tests. Composition tests live in one place to make the wiring checks explicit and easy to run.

Create three focused test files:

#### 2.1 `auth-wiring.test.ts`

Verify authentication flows through real composition:

```typescript
describe('Authentication Wiring', () => {
  describe('Bearer token auth', () => {
    it('accepts valid seeded token on protected routes')
    it('rejects invalid token with 401 and JSON { message }')
    it('rejects missing auth with 401 and JSON { message }')
    it('rejects malformed token with 401 and JSON { message }')
  })

  describe('Auth context propagation', () => {
    it('writes organizationId into created capture')
    it('writes createdById into created capture')
  })
})
```

Notes:
- Use the seeded token from `test-app.ts` (`tokenId:secret`, token ID is `...0002`).
- Avoid exact error message assertions; `createAuthMiddleware` and `createCombinedAuthMiddleware` return different message strings but should always return `401` with `{ message }`.

#### 2.2 `conditional-routes.test.ts`

Verify routes are registered based on config:

```typescript
describe('Conditional Route Registration', () => {
  describe('Admin routes', () => {
    it('registers /api/admin/* when admin config provided')
    it('returns 404 for /api/admin/* when admin config missing')
  })

  describe('WebAuthn-gated routes', () => {
    it('registers /api/auth/signup/* when WebAuthn config provided')
    it('registers /api/auth/login/* when WebAuthn config provided')
    it('returns 404 for /api/auth/* when WebAuthn config missing')
  })

  describe('Core routes always registered', () => {
    it('registers /api/health with 200')
    it('registers /api/captures with 401 (not 404) when unauthenticated')
    it('registers /api/tasks with 401 (not 404) when unauthenticated')
  })
})
```

#### 2.3 `error-handling.test.ts`

Verify error responses have consistent format:

```typescript
describe('Error Response Format', () => {
  it('returns JSON { message } for validation errors (ts-rest request validation)')
  it('returns JSON { message } for auth errors')
  it('returns JSON { message: "Not found" } for unknown /api routes')
})
```

Concrete checks:
- Validation error: POST `/api/captures` with empty body → 400 `{ message }`
- Auth error: POST `/api/captures` with no auth → 401 `{ message }`
- Not found: GET `/api/does-not-exist` → 404 `{ message: "Not found" }`

### Phase 3: Keep Existing Tests As-Is

- **`security.test.ts`** — Already excellent, leave in place (security-focused)
- **`composition-root.test.ts`** — Keep for basic boot smoke tests

### Files to Modify

| File | Action |
|------|--------|
| `apps/api/src/tests/helpers/test-app.ts` | Add new factory functions and exports |
| `apps/api/src/tests/composition/auth-wiring.test.ts` | Create new |
| `apps/api/src/tests/composition/conditional-routes.test.ts` | Create new |
| `apps/api/src/tests/composition/error-handling.test.ts` | Create new |

### What These Tests Catch (That Unit Tests Miss)

1. **Middleware not attached** — Auth middleware forgotten on a route
2. **Wrong service instance** — DI container wires wrong implementation
3. **Plugin order bugs** — Cookie parser after auth middleware
4. **Config-gating bugs** — Admin routes registered without admin config
5. **Error serialization** — Fastify error hooks not wired

## Verification

```bash
# Run all tests including new composition tests
devbox run pnpm test

# Run only composition tests
devbox run pnpm test -- apps/api/src/tests/composition

# Verify quality checks pass
devbox run pnpm quality
```

### Documentation

- Update `docs/PLAN.md` to note completion of the composition testing plan update.

## Out of Scope

- **Migrating existing route tests** to use `createTestApp()` — separate effort
- **Session auth tests** — requires seeding sessions, can add later
- **Acceptance test changes** — those are intentionally separate

## TDD Approach

For each test:
1. Write the failing test first
2. If it passes immediately → composition is correct, keep the test as documentation
3. If it fails → we found a wiring bug to fix

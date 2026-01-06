# Modular Monolith Architecture Review

This document proposes architectural changes to improve module boundaries, aggregate design, and service contracts in the Yoink codebase. The goal is to establish a proper "modular monolith" where each vertical slice maintains internal cohesion and clean interfaces.

## Status

**Status:** Draft
**Created:** 2026-01-06
**Last Updated:** 2026-01-06

---

## 1. Executive Summary

### Current Problems

1. **Module boundary violations** - Services import other modules' stores directly, bypassing service interfaces
2. **The `auth/domain/index.ts` facade anti-pattern** - Re-exports 60+ items from `users/` and `organizations/`
3. **No atomicity for cross-aggregate operations** - `withTransaction` was removed (Turso HTTP incompatible); operations like `processCaptureToTask` have no atomicity guarantees
4. **Unclear aggregate boundaries** - `SignupService` creates 5 entities across 4 "modules" in one operation

### Proposed Changes

| Area | Current State | Proposed State |
|------|---------------|----------------|
| Module Structure | `auth/`, `users/`, `organizations/`, `invitations/` separate | `identity/` (auth+users merged), `organizations/` (includes invitations) |
| Module Boundaries | Deep imports, services access foreign stores | ESLint-enforced boundaries via `eslint-plugin-boundaries` |
| Entry Points | Arbitrary imports from any file | Only `index.ts` exports are public |
| Aggregate Design | User, Org, Membership as separate aggregates | `UserIdentity` aggregate owns user + memberships |
| Cross-Aggregate Ops | Direct store access, no atomicity | Services call services; `db.batch()` for aggregate persistence |
| AdminService | Accesses stores from all modules directly | Facade that delegates to domain services |

---

## 2. Module Structure

### 2.1 Current Structure

```
apps/api/src/
├── admin/           # Admin panel (accesses all stores directly)
├── auth/            # Tokens, passkeys, sessions, signup
│   └── domain/index.ts  # Re-exports from users/ and organizations/
├── captures/        # Capture CRUD
├── health/          # Health checks
├── invitations/     # Just application layer (routes)
├── organizations/   # Orgs, memberships, invitation domain logic
├── processing/      # Cross-aggregate orchestration
├── tasks/           # Task CRUD
├── users/           # User entity and store
└── shared/          # AuthContext type
```

### 2.2 Proposed Structure

```
apps/api/src/
├── identity/                    # MERGED: auth + users
│   ├── domain/
│   │   ├── user.ts              # User entity
│   │   ├── user-store.ts        # User persistence interface
│   │   ├── user-service.ts      # User operations
│   │   ├── membership.ts        # OrganizationMembership (MOVED from organizations)
│   │   ├── membership-store.ts
│   │   ├── membership-service.ts
│   │   ├── api-token.ts
│   │   ├── token-store.ts
│   │   ├── token-service.ts
│   │   ├── passkey-credential.ts
│   │   ├── passkey-credential-store.ts
│   │   ├── passkey-service.ts
│   │   ├── user-session.ts
│   │   ├── user-session-store.ts
│   │   ├── session-service.ts
│   │   ├── signup-service.ts
│   │   ├── identity-errors.ts
│   │   └── index.ts             # PUBLIC API ONLY
│   ├── infrastructure/
│   │   ├── sqlite-user-store.ts
│   │   ├── sqlite-membership-store.ts
│   │   ├── sqlite-token-store.ts
│   │   ├── sqlite-passkey-credential-store.ts
│   │   ├── sqlite-user-session-store.ts
│   │   ├── fake-*.ts            # Test doubles
│   │   └── index.ts
│   └── application/
│       ├── auth-middleware.ts
│       ├── combined-auth-middleware.ts
│       ├── user-session-middleware.ts
│       ├── signup-routes.ts
│       ├── passkey-routes.ts
│       ├── auth-routes.ts
│       └── index.ts
│
├── organizations/               # Org details + invitations
│   ├── domain/
│   │   ├── organization.ts
│   │   ├── organization-store.ts
│   │   ├── organization-service.ts
│   │   ├── invitation.ts
│   │   ├── invitation-store.ts
│   │   ├── invitation-service.ts
│   │   ├── organization-errors.ts
│   │   └── index.ts
│   ├── infrastructure/
│   │   ├── sqlite-organization-store.ts
│   │   ├── sqlite-invitation-store.ts
│   │   ├── fake-*.ts
│   │   └── index.ts
│   └── application/
│       ├── invitation-routes.ts  # MOVED from invitations/
│       └── index.ts
│
├── captures/                    # Unchanged internal structure
│   ├── domain/
│   ├── infrastructure/
│   └── application/
│
├── tasks/                       # Unchanged internal structure
│   ├── domain/
│   ├── infrastructure/
│   └── application/
│
├── workflows/                   # RENAMED from processing/
│   ├── domain/
│   │   ├── capture-processing-workflow.ts
│   │   ├── signup-workflow.ts   # NEW: orchestrates signup
│   │   └── index.ts
│   └── application/             # No routes - workflows called by other modules
│
├── admin/                       # REFACTORED to use services
│   ├── domain/
│   │   ├── admin-service.ts     # Facade over domain services
│   │   ├── admin-session-service.ts
│   │   └── index.ts
│   └── application/
│
├── health/                      # Unchanged
├── shared/                      # Unchanged
├── config/                      # Unchanged
└── database/                    # Unchanged
```

### 2.3 Key Decisions

**Membership ownership:** Users own their memberships, not organizations.
- A membership represents "user X belongs to org Y with role Z"
- The user's identity includes which orgs they belong to
- `OrganizationMembership` moves from `organizations/` to `identity/`

**Passkeys and sessions remain separate:** These are auth infrastructure, not core identity.
- They reference users but don't need to be persisted atomically with user data
- Keeps the `UserIdentity` aggregate simpler

**Captures, Tasks, Notes are separate aggregates:**
- Different lifecycles and containment rules
- Processing a capture into a task is a cross-aggregate workflow

---

## 3. Module Boundary Enforcement

### 3.1 ESLint Configuration

Install `eslint-plugin-boundaries` to enforce:
1. **Element types** - Which modules can import from which
2. **Entry points** - Only `index.ts` exports are importable
3. **Import kinds** - Type-only imports allowed more broadly than value imports

```javascript
// apps/api/eslint.config.js
import boundaries from 'eslint-plugin-boundaries';

export default [
  {
    plugins: { boundaries },
    settings: {
      'boundaries/elements': [
        { type: 'identity', pattern: 'src/identity/**' },
        { type: 'organizations', pattern: 'src/organizations/**' },
        { type: 'captures', pattern: 'src/captures/**' },
        { type: 'tasks', pattern: 'src/tasks/**' },
        { type: 'workflows', pattern: 'src/workflows/**' },
        { type: 'admin', pattern: 'src/admin/**' },
        { type: 'health', pattern: 'src/health/**' },
        { type: 'shared', pattern: 'src/shared/**' },
        { type: 'config', pattern: 'src/config/**' },
        { type: 'database', pattern: 'src/database/**' },
        { type: 'composition', pattern: 'src/composition-root.ts' },
        { type: 'app', pattern: 'src/app.ts' },
      ],
    },
    rules: {
      'boundaries/element-types': ['error', {
        default: 'disallow',
        rules: [
          // Shared infrastructure - anyone can use
          { from: '*', allow: ['shared', 'config', 'database'] },
          
          // Composition root and app wire everything
          { from: 'composition', allow: '*' },
          { from: 'app', allow: '*' },
          
          // Self-references always allowed
          { from: 'identity', allow: ['identity'] },
          { from: 'organizations', allow: ['organizations'] },
          { from: 'captures', allow: ['captures'] },
          { from: 'tasks', allow: ['tasks'] },
          { from: 'workflows', allow: ['workflows'] },
          { from: 'admin', allow: ['admin'] },
          { from: 'health', allow: ['health'] },
          
          // Workflows can orchestrate (type-only for service interfaces)
          { from: 'workflows', allow: [
            ['identity', { importKind: 'type' }],
            ['organizations', { importKind: 'type' }],
            ['captures', { importKind: 'type' }],
            ['tasks', { importKind: 'type' }],
          ]},
          
          // Application layers use identity middleware (type-only)
          { from: 'captures', allow: [['identity', { importKind: 'type' }], 'workflows'] },
          { from: 'tasks', allow: [['identity', { importKind: 'type' }], 'workflows'] },
          { from: 'organizations', allow: [['identity', { importKind: 'type' }]] },
          { from: 'health', allow: [['identity', { importKind: 'type' }]] },
          
          // Admin facade uses services (type-only)
          { from: 'admin', allow: [
            ['identity', { importKind: 'type' }],
            ['organizations', { importKind: 'type' }],
          ]},
        ],
      }],
      
      'boundaries/entry-point': ['error', {
        default: 'disallow',
        rules: [
          // Only allow importing from index.ts files
          { target: 'src/**/domain/**', allow: 'index.ts' },
          { target: 'src/**/infrastructure/**', allow: 'index.ts' },
          { target: 'src/**/application/**', allow: 'index.ts' },
        ],
      }],
    },
  },
];
```

### 3.2 Entry Point Pattern

Each module layer exposes a clean public API via `index.ts`:

```typescript
// identity/domain/index.ts - PUBLIC API ONLY

// Services (factories and interfaces)
export { createUserService, type UserService } from './user-service.js';
export { createMembershipService, type MembershipService } from './membership-service.js';
export { createTokenService, type TokenService } from './token-service.js';
export { createSessionService, type SessionService } from './session-service.js';
export { createPasskeyService, type PasskeyService } from './passkey-service.js';
export { createSignupService, type SignupService } from './signup-service.js';

// Domain types (entities, value objects)
export type { User } from './user.js';
export type { OrganizationMembership, MembershipRole } from './membership.js';
export type { ApiToken } from './api-token.js';
export type { PasskeyCredential } from './passkey-credential.js';
export type { UserSession } from './user-session.js';

// Error types
export type { IdentityError } from './identity-errors.js';

// NOT EXPORTED:
// - Store interfaces (internal implementation detail)
// - Error factory functions (internal)
// - Internal helper functions
```

### 3.3 What Gets Enforced

| Pattern | Allowed | Blocked |
|---------|---------|---------|
| `import { UserService } from '../identity/domain/index.js'` | ✅ | |
| `import { UserService } from '../identity/domain'` | ✅ | |
| `import { UserStore } from '../identity/domain/user-store.js'` | | ❌ Deep import |
| `import { userNotFoundError } from '../identity/domain/identity-errors.js'` | | ❌ Deep import |
| `import type { UserStore } from '../identity/domain/user-store.js'` | | ❌ Deep import (even type-only) |

---

## 4. Service Contracts

### 4.1 Core Principle: Services Call Services

**Rule:** A service in module A must never import stores from module B. It must call module B's service instead.

```typescript
// WRONG: TokenService directly accesses UserStore
import type { UserStore } from '../../users/domain/user-store.js';

export const createTokenService = (deps: { userStore: UserStore }) => ({
  validateToken(query) {
    return deps.userStore.findById(userId).andThen((user) => {
      if (!user) return errAsync(userNotFoundError(userId));
      // ...
    });
  },
});

// RIGHT: TokenService calls UserService
import type { UserService } from '../user-service.js';  // Same module, OK

export const createTokenService = (deps: { userService: UserService }) => ({
  validateToken(query) {
    return deps.userService.getUser(userId).andThen((user) => {
      // UserService returns proper error if not found
      // ...
    });
  },
});
```

### 4.2 Required Service Method Additions

To support the "services call services" pattern, we need to add missing methods:

**IdentityService (expanded from UserService):**
```typescript
type UserService = {
  // Existing
  getUser(id: string): ResultAsync<User, UserNotFoundError | StorageError>;
  getUserByEmail(email: string): ResultAsync<User | null, StorageError>;
  
  // New - for admin
  getUsersByIds(ids: string[]): ResultAsync<User[], StorageError>;
  createUser(command: CreateUserCommand): ResultAsync<User, UserError>;
};
```

**OrganizationService:**
```typescript
type OrganizationService = {
  // Existing
  getOrganization(id: string): ResultAsync<Organization, OrgNotFoundError | StorageError>;
  createOrganization(command: CreateOrgCommand): ResultAsync<Organization, OrgError>;
  
  // New - for admin
  listOrganizations(): ResultAsync<Organization[], StorageError>;
  renameOrganization(id: string, name: string): ResultAsync<Organization, OrgError>;
};
```

**TokenService:**
```typescript
type TokenService = {
  // Existing
  validateToken(query: ValidateTokenQuery): ResultAsync<AuthResult, TokenValidationError>;
  
  // New - for admin
  listTokensByUser(userId: string): ResultAsync<ApiToken[], StorageError>;
  createToken(command: CreateTokenCommand): ResultAsync<TokenWithPlaintext, TokenError>;
  revokeToken(id: string): ResultAsync<void, TokenError>;
};
```

### 4.3 AdminService as Facade

AdminService delegates to domain services rather than accessing stores:

```typescript
// admin/domain/admin-service.ts

export type AdminServiceDependencies = {
  organizationService: OrganizationService;
  userService: UserService;
  membershipService: MembershipService;
  tokenService: TokenService;
};

export const createAdminService = (deps: AdminServiceDependencies): AdminService => {
  const { organizationService, userService, membershipService, tokenService } = deps;

  return {
    // Delegates to OrganizationService
    listOrganizations: () => organizationService.listOrganizations(),
    createOrganization: (name) => organizationService.createOrganization({ name }),
    renameOrganization: (id, name) => organizationService.renameOrganization(id, name),
    
    // Delegates to UserService + MembershipService
    listUsers: (orgId) => {
      return membershipService.listMembershipsByOrg(orgId)
        .andThen((memberships) => {
          const userIds = memberships.map(m => m.userId);
          return userService.getUsersByIds(userIds);
        });
    },
    createUser: (orgId, email) => userService.createUser({ organizationId: orgId, email }),
    
    // Delegates to TokenService
    listTokens: (userId) => tokenService.listTokensByUser(userId),
    createToken: (userId, name) => tokenService.createToken({ userId, name }),
    revokeToken: (id) => tokenService.revokeToken(id),
  };
};
```

---

## 5. Aggregate Persistence with `db.batch()`

### 5.1 The Problem

With Turso HTTP, each `db.execute()` is a separate HTTP request. Transaction state doesn't persist across requests, so `withTransaction` was removed.

For aggregates that span multiple tables (like `UserIdentity` with user + memberships), we need atomic persistence.

### 5.2 The Solution: `db.batch()`

Turso's `db.batch()` executes multiple statements in a single HTTP request, providing atomicity:

```typescript
// identity/infrastructure/sqlite-user-identity-store.ts

export const createSqliteUserIdentityStore = (db: Database) => ({
  saveNewUser(identity: NewUserIdentity): ResultAsync<void, StorageError> {
    const { user, personalOrg, memberships } = identity;
    
    // All statements execute atomically in one HTTP request
    return ResultAsync.fromPromise(
      db.batch([
        {
          sql: 'INSERT INTO organizations (id, name, created_at) VALUES (?, ?, ?)',
          args: [personalOrg.id, personalOrg.name, personalOrg.createdAt],
        },
        {
          sql: 'INSERT INTO users (id, email, created_at) VALUES (?, ?, ?)',
          args: [user.id, user.email, user.createdAt],
        },
        ...memberships.map(m => ({
          sql: 'INSERT INTO organization_memberships (id, user_id, organization_id, role, is_personal_org, joined_at) VALUES (?, ?, ?, ?, ?, ?)',
          args: [m.id, m.userId, m.organizationId, m.role, m.isPersonalOrg ? 1 : 0, m.joinedAt],
        })),
      ]),
      (error) => storageError('Failed to save user identity', error),
    ).map(() => undefined);
  },
});
```

### 5.3 When to Use `db.batch()`

Use `db.batch()` when persisting an aggregate that spans multiple tables:

| Aggregate | Tables | Use `db.batch()`? |
|-----------|--------|-------------------|
| UserIdentity (new user signup) | users, organizations, organization_memberships | Yes |
| Capture | captures | No (single table) |
| Task | tasks | No (single table) |
| Organization | organizations | No (single table) |
| Invitation | invitations | No (single table) |

### 5.4 Cross-Aggregate Workflows

For operations that span aggregates (like `processCaptureToTask`), we have options:

**Option A: Accept non-atomicity with idempotency**
- Use optimistic concurrency (`requiredStatus` checks)
- Design operations to be retriable
- Current approach for `processCaptureToTask`

**Option B: Combine into single batch (if same database)**
- Workflows can use `db.batch()` across aggregate boundaries
- Requires workflow to know about persistence details (leaky)

**Option C: Event sourcing (future)**
- Appending events is naturally atomic
- Deferred to future spike

**Current recommendation:** Option A for now. The `requiredStatus` check on `markAsProcessed` prevents double-processing. If the task save succeeds but capture update fails, the capture remains in inbox and can be reprocessed.

---

## 6. Implementation Phases

### Phase 1: ESLint Setup (Foundation)

**Goal:** Install and configure `eslint-plugin-boundaries` with permissive rules.

Tasks:
- [ ] Install `eslint` and `eslint-plugin-boundaries`
- [ ] Create `apps/api/eslint.config.js` with element definitions
- [ ] Configure permissive rules (warn, not error) to establish baseline
- [ ] Run ESLint and document current violations
- [ ] Add `lint` script to package.json

**Deliverable:** ESLint configured, baseline violations documented

### Phase 2: Module Consolidation

**Goal:** Merge modules and establish clean entry points.

Tasks:
- [ ] Create `identity/` directory structure
- [ ] Move `users/` files into `identity/`
- [ ] Move `auth/` files into `identity/`
- [ ] Move `OrganizationMembership` from `organizations/` to `identity/`
- [ ] Move `invitations/application/` into `organizations/application/`
- [ ] Delete empty directories
- [ ] Create clean `index.ts` files for each layer
- [ ] Update all import paths
- [ ] Run `pnpm quality` and fix any breaks

**Deliverable:** Consolidated module structure

### Phase 3: Clean Up Re-exports

**Goal:** Remove the facade anti-pattern from auth/domain/index.ts.

Tasks:
- [ ] Identify all external consumers of re-exported types
- [ ] Update imports to use canonical sources
- [ ] Remove re-exports from identity/domain/index.ts
- [ ] Ensure index.ts only exports public API

**Deliverable:** Clean entry points with no re-exports

### Phase 4: Fix Service Boundary Violations

**Goal:** Services call services, not foreign stores.

Tasks:
- [ ] Add missing service methods (see Section 4.2)
- [ ] Refactor `TokenService` to use `UserService` (internal to identity)
- [ ] Refactor `SignupService` to use services
- [ ] Refactor `AdminService` to be a facade
- [ ] Remove direct store imports in services
- [ ] Update composition-root.ts with new dependency wiring

**Deliverable:** No service imports stores from another module

### Phase 5: Enforce Boundaries

**Goal:** Enable ESLint errors for violations.

Tasks:
- [ ] Change ESLint rules from warn to error
- [ ] Enable entry-point restrictions
- [ ] Fix any remaining violations
- [ ] Add ESLint to CI pipeline
- [ ] Document module contracts

**Deliverable:** Strict boundary enforcement in CI

### Phase 6: Aggregate Persistence

**Goal:** Use `db.batch()` for aggregate atomicity.

Tasks:
- [ ] Create `UserIdentityStore` for atomic user+org+membership creation
- [ ] Refactor `SignupService` to use `UserIdentityStore`
- [ ] Test atomic behavior
- [ ] Document `db.batch()` patterns

**Deliverable:** Atomic aggregate persistence for signup

---

## 7. Success Criteria

- [ ] ESLint prevents cross-module deep imports
- [ ] All modules have clean `index.ts` entry points
- [ ] Services never import foreign stores directly
- [ ] `AdminService` delegates to domain services
- [ ] `SignupService` persists user identity atomically
- [ ] All acceptance tests pass
- [ ] All unit tests pass
- [ ] `pnpm quality` passes
- [ ] No orphaned entities possible from signup partial failures

---

## 8. Future Considerations

### Event Sourcing Spike

After completing module consolidation, we should spike on event sourcing to evaluate:
- Event store implementation (table design, Turso compatibility)
- Projection strategy (sync vs async)
- Migration path from current CRUD stores
- Impact on testing strategy

### Additional Aggregates

Consider whether other entities should form aggregates:
- Should `Task` include its capture reference as a child entity?
- When folders are added, what aggregate do they form with tasks/notes?

---

## Appendix: Current Violations

### Services Importing Foreign Stores

| Service | Foreign Stores | Files |
|---------|----------------|-------|
| TokenService | UserStore, OrganizationStore | token-service.ts |
| SignupService | UserStore, InvitationStore, OrganizationStore, OrganizationMembershipStore | signup-service.ts |
| SessionService | (none - uses UserService, MembershipService) | session-service.ts |
| PasskeyService | (none - uses UserService) | passkey-service.ts |
| AdminService | OrganizationStore, UserStore, TokenStore | admin-service.ts |
| ProcessingService | CaptureStore, TaskStore | processing-service.ts |
| MembershipService | OrganizationStore, (uses UserService) | membership-service.ts |

### Cross-Module Error Imports

| Consumer | Imports From | Error Types |
|----------|--------------|-------------|
| auth/domain/token-service.ts | users, organizations | userNotFoundError, organizationNotFoundError |
| auth/domain/session-service.ts | users | userNotFoundError |
| auth/domain/passkey-service.ts | users | userNotFoundError |
| auth/domain/auth-errors.ts | users, organizations | UserStorageError, OrganizationStorageError, etc. |
| processing/domain/processing-service.ts | captures, tasks | captureNotFoundError, taskNotFoundError |

### Re-exports in auth/domain/index.ts

The file re-exports 60+ items from:
- `users/domain/user.ts`
- `users/domain/user-store.ts`
- `users/domain/user-service.ts`
- `users/domain/user-errors.ts`
- `organizations/domain/organization.ts`
- `organizations/domain/organization-store.ts`
- `organizations/domain/organization-membership.ts`
- `organizations/domain/membership-service.ts`
- `organizations/domain/organization-errors.ts`

All of these re-exports should be removed after module consolidation.

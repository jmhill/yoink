# Testing Strategy

This document describes the testing architecture for Yoink, covering acceptance tests, API tests, and unit tests.

## Testing Philosophy

- **Test-Driven Development**: All code is written in response to failing tests
- **Test Behavior, Not Implementation**: Tests verify what the system does, not how it does it
- **Black-Box Testing**: Acceptance tests treat the system as a black box
- **Test What You Ship**: Acceptance tests run against the production Docker container

## Test Pyramid

```
                    ┌─────────────────────┐
                    │  Acceptance Tests   │  58 tests
                    │  (packages/         │  Full system behavior
                    │   acceptance-tests) │  against Docker container
                    └──────────┬──────────┘
                               │
              ┌────────────────┴────────────────┐
              │       Functional API Tests      │  ~50 tests
              │       (apps/api/**/*.test.ts)   │  Route handlers via
              │                                 │  Fastify inject
              └────────────────┬────────────────┘
                               │
       ┌───────────────────────┴───────────────────────┐
       │           Domain & Store Unit Tests           │  172 tests
       │    (apps/api/**/domain/*.test.ts)             │  Services, stores,
       │    (packages/**/src/*.test.ts)                │  infrastructure
       └───────────────────────────────────────────────┘
```

## Running Tests

```bash
# Unit tests + type checking + builds
pnpm quality

# Acceptance tests against Docker container
pnpm e2e:test

# Run specific unit test file
pnpm --filter @yoink/api test src/captures/domain/service.test.ts

# Run acceptance tests with verbose output
pnpm --filter @yoink/acceptance-tests test
```

---

## Acceptance Tests

Located in `packages/acceptance-tests/`, these tests verify end-to-end behavior against the actual Docker container. They use Dave Farley's 4-layer architecture.

### 4-Layer Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Use Cases (plain English test descriptions)                    │
│  "Capturing notes", "Organizing work", "Managing tenants"       │
│                                                                 │
│  describe('Capturing notes', () => {                            │
│    it('can create a new capture', async () => {                 │
│      const capture = await alice.createCapture({ content });    │
│    });                                                          │
│  });                                                            │
├─────────────────────────────────────────────────────────────────┤
│  DSL (domain interfaces)                                        │
│  Actor, Admin, Health - pure TypeScript interfaces              │
│                                                                 │
│  type Actor = {                                                 │
│    createCapture(input): Promise<Capture>;                      │
│    listCaptures(): Promise<Capture[]>;                          │
│    archiveCapture(id): Promise<Capture>;                        │
│  };                                                             │
├─────────────────────────────────────────────────────────────────┤
│  Drivers (implement DSL interfaces)                             │
│  HTTP driver, Playwright driver                                 │
│                                                                 │
│  createHttpActor(client, credentials): Actor                    │
│  createPlaywrightActor(page, credentials): Actor                │
└─────────────────────────────────────────────────────────────────┘
```

**Key Principle**: Use cases never reference drivers directly. They only use DSL interfaces. This allows the same tests to run against different transports (HTTP API, browser UI).

### Directory Structure

```
packages/acceptance-tests/src/
├── dsl/                          # Domain interfaces
│   ├── actor.ts                  # Actor, AnonymousActor
│   ├── admin.ts                  # Admin interface
│   ├── health.ts                 # Health interface
│   ├── types.ts                  # Capture, Organization, User, etc.
│   ├── errors.ts                 # UnauthorizedError, NotFoundError
│   └── index.ts
│
├── drivers/                      # Transport implementations
│   ├── types.ts                  # Driver, DriverConfig, DriverCapability
│   ├── http/                     # HTTP driver (API testing)
│   │   ├── http-client.ts        # Low-level fetch wrapper
│   │   ├── actor.ts              # Actor via REST API
│   │   ├── admin.ts              # Admin via REST API
│   │   ├── health.ts             # Health via REST API
│   │   └── index.ts
│   ├── playwright/               # Playwright driver (UI testing)
│   │   ├── actor.ts              # Actor via browser automation
│   │   ├── page-objects.ts       # Page Object classes
│   │   └── index.ts
│   └── index.ts
│
├── use-cases/                    # Test files
│   ├── harness.ts                # describeFeature(), test context
│   ├── capturing-notes.test.ts   # Create, list, get captures
│   ├── organizing-work.test.ts   # Archive, update, status changes
│   ├── managing-tenants.test.ts  # Org, user, token CRUD
│   ├── managing-sessions.test.ts # Login, logout, session management
│   ├── authenticating.test.ts    # Authentication enforcement
│   └── system-health.test.ts     # Health checks
│
├── config.ts                     # Environment configuration
└── reporter.ts                   # Custom markdown reporter
```

### DSL Interfaces

#### Actor (Authenticated User)

```typescript
type Actor = {
  readonly email: string;
  readonly userId: string;
  readonly organizationId: string;

  // Capture operations
  createCapture(input: CreateCaptureInput): Promise<Capture>;
  listCaptures(): Promise<Capture[]>;
  getCapture(id: string): Promise<Capture>;
  updateCapture(id: string, input: UpdateCaptureInput): Promise<Capture>;
  archiveCapture(id: string): Promise<Capture>;
  unarchiveCapture(id: string): Promise<Capture>;

  // Session operations (browser-only)
  goToSettings(): Promise<void>;
  logout(): Promise<void>;
};
```

#### AnonymousActor (Unauthenticated)

```typescript
type AnonymousActor = {
  createCapture(input: CreateCaptureInput): Promise<Capture>;
  listCaptures(): Promise<Capture[]>;
  getCapture(id: string): Promise<Capture>;
};
```

All operations throw `UnauthorizedError` - used to verify auth is enforced.

#### Admin

```typescript
type Admin = {
  login(): Promise<void>;
  logout(): Promise<void>;
  isLoggedIn(): Promise<boolean>;

  createOrganization(name: string): Promise<Organization>;
  listOrganizations(): Promise<Organization[]>;
  getOrganization(id: string): Promise<Organization>;
  renameOrganization(id: string, newName: string): Promise<Organization>;

  createUser(organizationId: string, email: string): Promise<User>;
  listUsers(organizationId: string): Promise<User[]>;
  getUser(id: string): Promise<User>;

  createToken(userId: string, name: string): Promise<CreateTokenResult>;
  listTokens(userId: string): Promise<Token[]>;
  revokeToken(tokenId: string): Promise<void>;
};
```

#### Health

```typescript
type Health = {
  check(): Promise<HealthStatus>;
};
```

### Driver Capabilities

Tests declare which drivers they support:

```typescript
// Runs on both HTTP and Playwright
describeFeature('Capturing notes', ['http', 'playwright'], ({ it, createActor }) => {
  it('can create a new capture', async () => {
    const alice = await createActor('alice@example.com');
    const capture = await alice.createCapture({ content: 'Buy milk' });
    expect(capture.content).toBe('Buy milk');
  });
});

// HTTP only (API-specific features)
describeFeature('Capturing notes - API features', ['http'], ({ it, createActor }) => {
  it('includes user and org info in response', async () => {
    // Only makes sense for API, not UI
  });
});

// Playwright only (UI-specific tests)
describeFeature('Session management', ['playwright'], ({ it, createActor }) => {
  it('can logout via settings page', async () => {
    // Only available in browser
  });
});
```

### Multi-Driver Execution

A single vitest run executes each test against all applicable drivers:

- Test names include driver suffix: `can create capture [http]`, `can create capture [playwright]`
- Custom reporter outputs unified markdown table showing pass/fail/N/A per driver
- CI displays report in GitHub Actions step summary

**Current test counts:**
- HTTP driver: 44 tests
- Playwright driver: 14 tests
- Total: 58 tests

### Writing Acceptance Tests

```typescript
import { describeFeature, expect, beforeEach } from './harness.js';
import { UnauthorizedError } from '../dsl/index.js';

describeFeature('Capturing notes', ['http', 'playwright'], ({
  it,
  beforeEach,
  createActor,
  createAnonymousActor,
}) => {
  let alice: Actor;
  let anonymous: AnonymousActor;

  beforeEach(async () => {
    // Each test gets a fresh isolated tenant
    alice = await createActor('alice@example.com');
    anonymous = createAnonymousActor();
  });

  it('can create a new capture', async () => {
    const capture = await alice.createCapture({ content: 'Buy milk' });

    expect(capture.content).toBe('Buy milk');
    expect(capture.status).toBe('inbox');
  });

  it('requires authentication', async () => {
    await expect(anonymous.createCapture({ content: 'test' }))
      .rejects.toThrow(UnauthorizedError);
  });

  it('shows captures in the list', async () => {
    await alice.createCapture({ content: 'First' });
    await alice.createCapture({ content: 'Second' });

    const captures = await alice.listCaptures();

    expect(captures).toHaveLength(2);
  });
});
```

**Key points:**
- `it` comes from the context, not an import (enables driver suffix in test names)
- Each test gets an isolated tenant (organization + user + token)
- No HTTP verbs or protocol details in test descriptions
- Tests read like plain English: "alice creates a capture"

### Test Isolation

Each `createActor()` call creates:
- New organization (unique name based on test name + driver)
- New user with the provided email
- New API token for authentication

This ensures complete isolation between tests, even when running in parallel.

---

## Functional API Tests

Located in `apps/api/src/**/*.test.ts`, these test HTTP routes without network overhead using Fastify's `inject` method.

### Example: Route Handler Test

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createApp } from '../app.js';
import { createFakeClock } from '@yoink/infrastructure/clock';

describe('POST /api/captures', () => {
  let app: FastifyInstance;
  let token: string;

  beforeAll(async () => {
    const db = createDatabase({ path: ':memory:' });
    const clock = createFakeClock();
    app = createApp({ db, clock });
    await app.ready();
    
    // Seed test data and get token
    token = await seedTestUser(db);
  });

  afterAll(async () => {
    await app.close();
  });

  it('creates a capture with valid token', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/captures',
      headers: { authorization: `Bearer ${token}` },
      payload: { content: 'Test capture' },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      content: 'Test capture',
      status: 'inbox',
    });
  });

  it('returns 401 without token', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/captures',
      payload: { content: 'Test' },
    });

    expect(response.statusCode).toBe(401);
  });
});
```

### When to Use Functional API Tests

- Testing middleware behavior (auth, validation, error handling)
- Testing edge cases that are awkward to set up via acceptance tests
- Faster feedback than acceptance tests (no Docker container)

---

## Domain & Store Tests

### Domain Service Tests

Test business logic with fake dependencies:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { createCaptureService } from './service.js';
import { createFakeClock } from '@yoink/infrastructure/clock';
import { createFakeIdGenerator } from '@yoink/infrastructure/id-generator';

describe('CaptureService', () => {
  let service: CaptureService;
  let store: FakeCaptureStore;
  let clock: FakeClock;

  beforeEach(() => {
    store = createFakeCaptureStore();
    clock = createFakeClock({ now: new Date('2024-01-01T00:00:00Z') });
    const idGenerator = createFakeIdGenerator();
    
    service = createCaptureService({ store, clock, idGenerator });
  });

  it('creates a capture with inbox status', async () => {
    const capture = await service.createCapture({
      content: 'Test',
      userId: 'user-1',
      organizationId: 'org-1',
    });

    expect(capture.status).toBe('inbox');
    expect(capture.createdAt).toEqual(clock.now());
  });

  it('sets archivedAt when archiving', async () => {
    clock.advance({ minutes: 5 });
    
    const capture = await service.archiveCapture('capture-1');

    expect(capture.status).toBe('archived');
    expect(capture.archivedAt).toEqual(clock.now());
  });
});
```

### Store Contract Tests

Test that store implementations satisfy the interface contract:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { createSqliteCaptureStore } from './sqlite-capture-store.js';
import { createDatabase } from '../../database/index.js';

describe('SqliteCaptureStore', () => {
  let store: CaptureStore;
  let db: Database;

  beforeEach(async () => {
    db = createDatabase({ path: ':memory:' });
    await runMigrations(db);
    store = createSqliteCaptureStore(db);
  });

  it('persists and retrieves captures', async () => {
    const capture: Capture = {
      id: 'cap-1',
      content: 'Test',
      status: 'inbox',
      organizationId: 'org-1',
      userId: 'user-1',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await store.save(capture);
    const retrieved = await store.findById('cap-1');

    expect(retrieved).toEqual(capture);
  });

  it('scopes queries by organization', async () => {
    await store.save({ ...baseCapture, id: 'cap-1', organizationId: 'org-1' });
    await store.save({ ...baseCapture, id: 'cap-2', organizationId: 'org-2' });

    const org1Captures = await store.findByOrganization('org-1');

    expect(org1Captures).toHaveLength(1);
    expect(org1Captures[0].id).toBe('cap-1');
  });
});
```

### Fake Dependencies

Located in `packages/infrastructure/`:

```typescript
// Fake clock for deterministic time
const clock = createFakeClock({ now: new Date('2024-01-01') });
clock.advance({ hours: 1 });
expect(clock.now()).toEqual(new Date('2024-01-01T01:00:00Z'));

// Fake ID generator for predictable IDs
const idGenerator = createFakeIdGenerator({ prefix: 'test' });
expect(idGenerator.generate()).toBe('test-1');
expect(idGenerator.generate()).toBe('test-2');

// Fake password hasher for fast tests
const hasher = createFakePasswordHasher();
const hash = await hasher.hash('password');
expect(hash).toBe('fake-hash:password');
expect(await hasher.verify('password', hash)).toBe(true);
```

---

## Adding New Tests

### New Acceptance Test

1. Identify the correct use-case file or create a new one
2. Add to existing `describeFeature` or create a new one
3. Specify which drivers support the test: `['http', 'playwright']` or `['http']`
4. Use DSL interfaces (Actor, Admin, Health) - never reference drivers directly
5. If new DSL methods are needed, add to the interface first

### New DSL Method

1. Add method to DSL interface (`actor.ts`, `admin.ts`, or `health.ts`)
2. Implement in HTTP driver (`drivers/http/`)
3. Implement in Playwright driver (`drivers/playwright/`) if applicable
4. If Playwright doesn't support the operation, throw `UnsupportedOperationError`

### New Unit Test

1. Create test file next to implementation: `foo.ts` → `foo.test.ts`
2. Use fake dependencies for isolation
3. Test behavior, not implementation details

---

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `TEST_BASE_URL` | Base URL for acceptance tests | `http://localhost:3333` |
| `TEST_ADMIN_PASSWORD` | Admin password for acceptance tests | Required |

### Vitest Configuration

- Unit tests: `vitest.config.ts` in each package/app
- Acceptance tests: `packages/acceptance-tests/vitest.config.ts`
- Shared config: `vitest.shared.ts` in repository root

---

## References

- [Dave Farley - Acceptance Testing](https://www.youtube.com/watch?v=SXbhOqz5hYo) - 4-layer architecture source
- [TESTING_STRATEGY.md](./TESTING_STRATEGY.md) - Narrative on lessons learned building this infrastructure

# E2E Testing Pipeline

> **Note**: This document describes the original design. For current testing documentation, see [TESTING.md](TESTING.md).

> **Status: Implemented** ✓
> 
> This architecture is fully implemented and running in CI. See `packages/acceptance-tests/` for the implementation.

## Overview

This document describes our E2E testing pipeline that properly tests the production artifact before deployment. We use Dave Farley's 4-layer testing architecture to ensure we "test what we ship."

## 4-Layer Architecture

Our acceptance tests follow Dave Farley's layered architecture where dependencies flow upward:

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
│  HTTP driver (now), Playwright driver (future)                  │
│                                                                 │
│  // Driver implements DSL interface                             │
│  createHttpActor(client, credentials): Actor                    │
└─────────────────────────────────────────────────────────────────┘
```

**Key Principle**: Use cases never reference drivers directly. They only use DSL interfaces. Drivers implement those interfaces for specific transports (HTTP, browser UI, etc.).

## Package Structure

```
packages/acceptance-tests/src/
├── dsl/                          # Domain interfaces (what)
│   ├── types.ts                  # Capture, Organization, User, etc.
│   ├── errors.ts                 # UnauthorizedError, NotFoundError
│   ├── actor.ts                  # Actor, AnonymousActor interfaces
│   ├── admin.ts                  # Admin interface
│   ├── health.ts                 # Health interface
│   └── index.ts
│
├── drivers/                      # Transport implementations (how)
│   ├── types.ts                  # Driver, DriverCapability
│   ├── http/
│   │   ├── http-client.ts        # Low-level fetch wrapper
│   │   ├── actor.ts              # Actor via REST API
│   │   ├── admin.ts              # Admin via REST API
│   │   ├── health.ts             # Health via REST API
│   │   └── index.ts              # createHttpDriver()
│   └── index.ts                  # getDriver() factory
│
├── use-cases/                    # Tests (why)
│   ├── harness.ts                # describeFeature(), test context
│   ├── capturing-notes.test.ts   # Create, list, get captures
│   ├── organizing-work.test.ts   # Archive, update, status changes
│   ├── managing-tenants.test.ts  # Org, user, token CRUD
│   ├── authenticating.test.ts    # Login, logout, sessions
│   └── system-health.test.ts     # Health checks
│
└── config.ts                     # Environment configuration
```

## Actor Pattern

Tests use the Actor pattern to represent authenticated users:

```typescript
describeFeature('Capturing notes', ['http', 'playwright'], ({ createActor }) => {
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
});
```

**Benefits:**
- Tests read like plain English: "alice creates a capture"
- No HTTP verbs or protocol details in test descriptions
- Multi-user tests are easy: "bob cannot see alice's captures"
- Anonymous access is just another actor type

## Driver Capabilities

Tests declare which drivers they support:

```typescript
// Runs on both HTTP and Playwright drivers
describeFeature('Capturing notes', ['http', 'playwright'], ...)

// HTTP only (admin panel tests)
describeFeature('Managing tenants', ['http'], ...)
```

The test harness skips tests for unsupported drivers. This allows:
- Running API tests via HTTP driver now
- Running same tests via Playwright later (UI testing)
- Adding new drivers without modifying tests

## CI/CD Pipeline

```
┌────────────────────────────────────────────────────────────────────────────┐
│                              CI/CD Pipeline                                │
├────────────────────────────────────────────────────────────────────────────┤
│                                                                            │
│  ┌──────────┐    ┌────────────────┐    ┌───────────┐    ┌──────────────┐  │
│  │ quality  │───►│ build-artifact │───►│ e2e-tests │───►│    deploy    │  │
│  └──────────┘    └────────────────┘    └───────────┘    └──────────────┘  │
│       │                  │                   │                  │         │
│       ▼                  ▼                   ▼                  ▼         │
│  • lint               • docker build     • Start container   • fly deploy│
│  • typecheck          • push to Fly.io   • Run acceptance      --image   │
│  • unit tests           registry           tests against it  • smoke test│
│                       • tag with SHA     • Tear down                      │
│                                                                            │
└────────────────────────────────────────────────────────────────────────────┘
```

## Running Tests

```bash
# Run E2E tests locally (starts container, runs tests, cleans up)
pnpm e2e:test

# Run against a custom environment
TEST_BASE_URL=https://staging.example.com \
TEST_ADMIN_PASSWORD=staging-password \
pnpm --filter @yoink/acceptance-tests test

# Run with a specific driver (future)
DRIVER=playwright pnpm --filter @yoink/acceptance-tests test
```

## Configuration

| Variable | Description | Example |
|----------|-------------|---------|
| `TEST_BASE_URL` | Base URL of system under test | `http://localhost:3333` |
| `TEST_ADMIN_PASSWORD` | Admin panel password | `test-admin-password` |
| `DRIVER` | Which driver to use (default: `http`) | `http`, `playwright` |

## Design Decisions

### Why This Architecture?

1. **Tests read like specs** - No protocol details pollute test descriptions
2. **Portable** - Same tests work against API (HTTP) or UI (Playwright)
3. **Isolated** - Each test gets its own tenant, no interference
4. **Black-box** - No internal dependencies, truly external testing
5. **Extensible** - Add new drivers without changing tests

### Test Isolation

Each test creates a fresh Actor with:
- New organization (unique name)
- New user (test email)
- New API token

This ensures complete isolation between tests, even when running in parallel.

### Error Handling

The DSL uses typed errors for assertions:

```typescript
import { UnauthorizedError, NotFoundError, ValidationError } from '../dsl/index.js';

await expect(anonymous.createCapture({ content: 'test' }))
  .rejects.toThrow(UnauthorizedError);

await expect(alice.getCapture('non-existent-id'))
  .rejects.toThrow(NotFoundError);
```

## Future: Playwright Driver

When we add UI testing, the Playwright driver will implement the same DSL:

```typescript
// drivers/playwright/actor.ts
export const createPlaywrightActor = (page: Page, credentials): Actor => ({
  async createCapture(input) {
    await page.goto('/captures/new');
    await page.fill('[name="content"]', input.content);
    await page.click('button[type="submit"]');
    // Extract created capture from page
    return parseCapture(page);
  },
  // ... other methods
});
```

Same tests, different transport - validates the UI works correctly.

## References

- [Dave Farley - Acceptance Testing](https://www.youtube.com/watch?v=SXbhOqz5hYo)
- [Fly.io Deploy Documentation](https://fly.io/docs/launch/deploy/)

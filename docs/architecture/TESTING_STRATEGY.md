# Building a Proper Acceptance Testing Strategy: Lessons from Getting It Wrong First

## The Problem: Testing What We Ship

We had a classic CI/CD gap. Our pipeline ran unit tests against in-process code, built a Docker image, then deployed it to production. The problem? We never actually tested the Docker image before deploying it.

This bit us when a dependency mismatch (`@fastify/static` v8 vs v5) only surfaced when Fly.io tried to start the container. The tests passed. The build succeeded. Production broke.

The solution seemed obvious: run our acceptance tests against the actual Docker container before deploying. We'd heard Dave Farley talk about his 4-layer testing architecture and thought we understood it. We were wrong.

## First Attempt: The Obvious (Wrong) Approach

Our first implementation looked reasonable on the surface:

```typescript
// What we built initially
describe('POST /captures', () => {
  it('creates a capture with valid token', async () => {
    const response = await client.post(
      '/captures',
      { content: 'test' },
      { authorization: `Bearer ${token}` }
    );
    expect(response.statusCode).toBe(201);
  });
});
```

We had three layers:
- **Use Cases**: Test files with `describe` blocks
- **DSL**: Helper functions like `loginToAdminPanel(client, password)`
- **Drivers**: An HTTP client that made fetch requests

It worked. Tests ran against the container. Problem solved, right?

## The Code Review That Changed Everything

When reviewing the implementation, something felt off. The test descriptions had HTTP verbs: `POST /captures`, `GET /health`. The DSL functions took the HTTP client as a parameter. The use cases imported and used the driver directly.

Then the insight clicked: **we had inverted the dependencies**.

In our implementation:
```
Use Cases → imports → DSL → imports → Drivers
```

But Farley's architecture requires:
```
Use Cases → uses → DSL (interface)
                      ↑
              Drivers implements
```

This is exactly the same pattern as hexagonal architecture! In a hexagonal system:
- The **domain** defines interfaces (ports)
- **Adapters** implement those interfaces
- The domain never imports adapters directly

We had built the testing equivalent of an anemic domain model—the structure looked right, but the dependencies flowed backwards.

## The Eureka Moment: It's Just Hexagonal Architecture

Once we saw the parallel, the correct design became obvious:

| Hexagonal Architecture | 4-Layer Testing |
|------------------------|-----------------|
| Domain interfaces (ports) | DSL interfaces |
| Infrastructure adapters | Protocol drivers |
| Application services | Use cases |
| Domain never imports adapters | Tests never import drivers |

The DSL should define *what* we can do in pure domain terms:

```typescript
// DSL defines the interface
type Actor = {
  createCapture(input: CreateCaptureInput): Promise<Capture>;
  listCaptures(): Promise<Capture[]>;
  archiveCapture(id: string): Promise<Capture>;
};
```

Drivers *implement* that interface for a specific transport:

```typescript
// HTTP driver implements the interface
const createHttpActor = (client: HttpClient, credentials): Actor => ({
  async createCapture(input) {
    const response = await client.post('/captures', input, authHeaders());
    // ... translate HTTP to domain
    return response.json<Capture>();
  },
});
```

Use cases only know about the DSL:

```typescript
// Test uses DSL, never mentions HTTP
it('can create a new capture', async () => {
  const capture = await alice.createCapture({ content: 'Buy milk' });
  expect(capture.status).toBe('inbox');
});
```

## The Actor Pattern: Making Tests Read Like English

Beyond fixing the dependency direction, we adopted the Actor pattern for representing users. Instead of managing tokens and auth headers, tests talk about *who* is doing *what*:

```typescript
describeFeature('Capturing notes', ['http', 'playwright'], ({ createActor }) => {
  let alice: Actor;
  let anonymous: AnonymousActor;

  beforeEach(async () => {
    alice = await createActor('alice@example.com');
    anonymous = createAnonymousActor();
  });

  it('can create a new capture', async () => {
    const capture = await alice.createCapture({ content: 'Remember the milk' });
    expect(capture.content).toBe('Remember the milk');
  });

  it('requires authentication', async () => {
    await expect(anonymous.createCapture({ content: 'test' }))
      .rejects.toThrow(UnauthorizedError);
  });
});
```

Notice: no HTTP verbs, no status codes, no JSON parsing. Just domain language.

## The Payoff: Driver Portability

The real power of this architecture shows when you add another driver. We built the HTTP driver for API testing. But the same tests will work with a Playwright driver for UI testing:

```typescript
// Future: Playwright driver implements same interface
const createPlaywrightActor = (page: Page, credentials): Actor => ({
  async createCapture(input) {
    await page.goto('/captures/new');
    await page.fill('[name="content"]', input.content);
    await page.click('button[type="submit"]');
    return parseCapture(page);
  },
});
```

Same test. Same assertions. Different transport. The test verifies the *behavior*, not the *mechanism*.

## Working with AI: Collaborative Architecture

This refactoring happened through an extended conversation with an AI coding assistant. The process was notably different from either solo development or traditional pair programming.

**What worked well:**

1. **Rubber duck debugging at scale**: Explaining the problem to the AI forced clear articulation. When I said "the dependencies are wrong," I had to explain *why* they were wrong, which crystallized the hexagonal architecture parallel.

2. **Rapid prototyping of alternatives**: The AI could quickly sketch out "what if we structured it this way?" options. Seeing three different approaches side-by-side made the tradeoffs obvious.

3. **Consistent application of patterns**: Once we agreed on the Actor pattern, the AI applied it consistently across all test files. No drift, no "I'll just do it slightly differently here."

4. **Comprehensive refactoring**: Restructuring 37 tests across multiple files, plus all the supporting infrastructure, would be tedious solo work. The AI handled the mechanical transformation while I focused on whether the design was right.

**What required human judgment:**

1. **Recognizing the problem**: The AI's first implementation had inverted dependencies. It took human review to notice something was off and articulate *why*.

2. **Connecting to prior knowledge**: The hexagonal architecture parallel came from human experience. The AI knew both patterns but didn't spontaneously connect them.

3. **Deciding what matters**: Should we use Result types or throw errors? One actor per test or per file? These design decisions required human judgment about project context and team preferences.

The collaboration worked because it was genuinely collaborative—neither "AI writes everything" nor "human writes everything with AI autocomplete." The human provided architectural insight and design judgment. The AI provided implementation velocity and consistency.

## The Final Architecture

```
packages/acceptance-tests/src/
├── dsl/                          # Domain interfaces
│   ├── types.ts                  # Capture, User, Organization
│   ├── errors.ts                 # UnauthorizedError, NotFoundError
│   ├── actor.ts                  # Actor, AnonymousActor
│   ├── admin.ts                  # Admin
│   └── health.ts                 # Health
│
├── drivers/                      # Transport implementations
│   ├── types.ts                  # Driver interface
│   └── http/                     # HTTP driver
│       ├── actor.ts              # Actor via REST
│       ├── admin.ts              # Admin via REST
│       └── http-client.ts        # Low-level fetch
│
└── use-cases/                    # Tests (plain English)
    ├── harness.ts                # Test setup
    ├── capturing-notes.test.ts
    ├── organizing-work.test.ts
    ├── managing-tenants.test.ts
    ├── authenticating.test.ts
    └── system-health.test.ts
```

36 tests. 5 feature files. Zero HTTP verbs in test descriptions. Ready for a Playwright driver when we build the UI.

## Lessons Learned

1. **Structure isn't architecture**: Having layers doesn't mean you have proper separation. Dependency direction matters.

2. **Known patterns transfer**: If you understand hexagonal architecture, you already understand how to structure acceptance tests. The insight is recognizing they're the same pattern.

3. **Tests are documentation**: When test descriptions read like "POST /captures returns 201," they document the API. When they read like "can create a new capture," they document the *capability*. The second is more valuable.

4. **AI accelerates, humans architect**: The most effective collaboration uses AI for implementation velocity while humans provide design judgment and pattern recognition.

5. **Get it wrong first**: Our initial wrong implementation wasn't wasted work. It was the concrete example that made the right design obvious. Sometimes you have to build the wrong thing to see why it's wrong.

## References

- [Dave Farley - Acceptance Testing](https://www.youtube.com/watch?v=SXbhOqz5hYo)
- [Hexagonal Architecture (Ports and Adapters)](https://alistair.cockburn.us/hexagonal-architecture/)
- [Growing Object-Oriented Software, Guided by Tests](http://www.growing-object-oriented-software.com/)

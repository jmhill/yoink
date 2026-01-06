# Domain Events Architecture

> **Note:** This document is partially outdated. The `withTransaction` helper has been removed because it doesn't work with Turso HTTP connections. See [MODULAR_MONOLITH.md](./MODULAR_MONOLITH.md) for the current architectural direction, which uses `db.batch()` for aggregate atomicity and defers event sourcing to a future spike.

This document explores domain events as an architectural pattern and how it could fit into this codebase.

## The Problem: Cross-Aggregate Operations

Our application has operations that span multiple aggregates:

1. **Process Capture to Task**: Creates a task AND marks the source capture as processed
2. **Delete Task with Cascade**: Deletes a task AND its source capture (if any)
3. **User Signup**: Creates user, personal organization, memberships, accepts invitation

These operations ideally need atomicity - either all parts succeed or none do.

## Current Approach: Sequential Operations with Optimistic Concurrency

Since Turso HTTP doesn't support connection-level transactions (each `db.execute()` is a separate HTTP request), we use:

1. **Optimistic concurrency checks** - e.g., `requiredStatus: 'inbox'` on `markAsProcessed`
2. **`db.batch()`** - for operations within a single aggregate that spans multiple tables
3. **Idempotent/retriable operations** - design for eventual consistency where full atomicity isn't possible

```typescript
// Current approach - no transaction wrapper
processCaptureToTask: (command) => {
  return captureStore.findById(command.id).andThen((capture) => {
    // ...
    return taskStore.save(task).andThen(() => {
      return captureStore.markAsProcessed({
        // requiredStatus provides optimistic concurrency
        requiredStatus: 'inbox',
        // ...
      });
    });
  });
};
```

## Alternative: Domain Events

An event-driven approach would have services publish events when significant things happen, and other services subscribe to react:

```typescript
// Event types define the contract
type CaptureProcessedEvent = {
  type: 'CaptureProcessed';
  captureId: string;
  organizationId: string;
  createdById: string;
  title: string;
  dueDate?: string;
  processedAt: string;
};

type TaskDeletedEvent = {
  type: 'TaskDeleted';
  taskId: string;
  captureId?: string;
  deletedAt: string;
};
```

### Event Dispatcher

A simple in-process event dispatcher:

```typescript
type EventHandler<T> = (event: T) => ResultAsync<void, Error>;

type EventDispatcher = {
  subscribe: <T>(eventType: string, handler: EventHandler<T>) => void;
  publish: (event: DomainEvent) => ResultAsync<void, Error>;
};

const createEventDispatcher = (): EventDispatcher => {
  const handlers = new Map<string, EventHandler<DomainEvent>[]>();

  return {
    subscribe: (eventType, handler) => {
      const existing = handlers.get(eventType) ?? [];
      handlers.set(eventType, [...existing, handler]);
    },

    publish: (event) => {
      const eventHandlers = handlers.get(event.type) ?? [];
      // Run all handlers synchronously, chain with andThen
      return eventHandlers.reduce(
        (result, handler) => result.andThen(() => handler(event)),
        okAsync(undefined)
      );
    },
  };
};
```

### Service Subscriptions

Services would subscribe to events they care about:

```typescript
// CaptureService subscribes to TaskDeleted
eventDispatcher.subscribe('TaskDeleted', (event: TaskDeletedEvent) => {
  if (event.captureId) {
    return store.softDelete(event.captureId);
  }
  return okAsync(undefined);
});

// TaskService subscribes to CaptureProcessed
eventDispatcher.subscribe('CaptureProcessed', (event: CaptureProcessedEvent) => {
  const task: Task = {
    id: idGenerator.generate(),
    organizationId: event.organizationId,
    createdById: event.createdById,
    title: event.title,
    captureId: event.captureId,
    dueDate: event.dueDate,
    createdAt: clock.now().toISOString(),
  };
  return store.save(task);
});
```

## Tradeoffs

| Aspect | Orchestration | Domain Events |
|--------|---------------|---------------|
| **Atomicity** | Requires db.batch() or accept eventual consistency | Same - events don't solve atomicity alone |
| **Coupling** | Workflow knows both domains | Services decoupled, only know events |
| **Complexity** | Lower - direct calls | Higher - dispatcher, handlers, event types |
| **Traceability** | Linear call stack | Indirection through event handlers |
| **Testability** | Test service directly | Can test services in isolation with fake events |
| **Extensibility** | Add code to coordinator | Add new subscribers without changing publishers |

## When Domain Events Shine

Domain events are particularly valuable when:

1. **Multiple reactions to one event**: "When a capture is processed, create task, send notification, update analytics, log audit trail..."
2. **Loose coupling needed**: Services evolve independently, different teams own different services
3. **Future microservices**: Event-driven is a stepping stone to async messaging
4. **Audit requirements**: Events naturally create an audit log of what happened

## When Orchestration is Simpler

Orchestration (workflow pattern) is the better choice when:

1. **Few cross-domain operations**: Only 2-3 operations that span aggregates
2. **Simple flows**: Linear A-then-B operations, not complex choreography
3. **Small team**: No need for service isolation

## Current Direction

See [MODULAR_MONOLITH.md](./MODULAR_MONOLITH.md) for the current architectural direction:

1. **Module consolidation** - Merge related modules (auth+users → identity)
2. **Clean boundaries** - ESLint enforces module entry points
3. **Services call services** - No cross-module store access
4. **`db.batch()` for aggregates** - Atomic persistence within an aggregate
5. **Workflows for cross-aggregate** - Accept eventual consistency with optimistic concurrency

Event sourcing remains a future option if:
- We need guaranteed atomicity across aggregates
- We want a complete audit trail
- The complexity tradeoff becomes worthwhile

## References

- [Domain-Driven Design by Eric Evans](https://www.domainlanguage.com/ddd/)
- [Implementing Domain-Driven Design by Vaughn Vernon](https://www.oreilly.com/library/view/implementing-domain-driven-design/9780133039900/)
- [Martin Fowler on Domain Events](https://martinfowler.com/eaaDev/DomainEvent.html)

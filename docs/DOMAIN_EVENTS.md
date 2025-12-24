# Domain Events Architecture

This document explores domain events as an architectural pattern and how it could fit into this codebase. We document the tradeoffs and explain our current choice to use orchestration with transactions.

## The Problem: Cross-Aggregate Operations

Our application has operations that span multiple aggregates:

1. **Process Capture to Task**: Creates a task AND marks the source capture as processed
2. **Delete Task with Cascade**: Deletes a task AND its source capture (if any)

These operations need to be atomic - either both parts succeed or neither does. Currently, our `ProcessingService` orchestrates these operations by directly calling stores.

## Current Approach: Orchestration

```typescript
// ProcessingService coordinates stores directly
processCaptureToTask: (command) => {
  return captureStore.findById(command.id).andThen((capture) => {
    // Validation...
    return taskStore.save(task).andThen(() => {
      return captureStore.markAsProcessed({ ... });
    });
  });
};
```

The `ProcessingService` is the "coordinator" that knows both steps and executes them sequentially. We wrap this in a database transaction for atomicity.

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

### ProcessingService Becomes a Publisher

```typescript
processCaptureToTask: (command) => {
  return captureStore.findById(command.id).andThen((capture) => {
    // Validation...
    
    // Publish event - handlers run synchronously within transaction
    return eventDispatcher.publish({
      type: 'CaptureProcessed',
      captureId: capture.id,
      organizationId: command.organizationId,
      createdById: command.createdById,
      title: command.title ?? truncate(capture.content, 100),
      dueDate: command.dueDate,
      processedAt: clock.now().toISOString(),
    });
  });
};
```

## Tradeoffs

| Aspect | Orchestration | Domain Events |
|--------|---------------|---------------|
| **Atomicity** | Straightforward with transactions | Same (synchronous handlers in transaction) |
| **Coupling** | ProcessingService knows both domains | Services decoupled, only know events |
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

Orchestration is the better choice when:

1. **Few cross-domain operations**: Only 2-3 operations that span aggregates
2. **Single database**: All data in one database, transactions are cheap
3. **Small team**: No need for service isolation
4. **Simple flows**: Linear A-then-B operations, not complex choreography

## Our Decision: Orchestration with Transactions

For this codebase, we chose orchestration because:

1. **Scope is limited**: Only 2 cross-aggregate operations exist
2. **Single SQLite database**: Transactions are straightforward and reliable
3. **Monolithic deployment**: No microservices, no need for loose coupling
4. **Simplicity**: Direct calls are easier to understand and debug

We wrap `ProcessingService` operations in database transactions to ensure atomicity:

```typescript
processCaptureToTask: (command) => {
  return withTransaction(db, () => {
    // All store operations here are atomic
    return captureStore.findById(command.id).andThen((capture) => {
      // ...
    });
  });
};
```

## Future Evolution

If the application grows to need domain events, the migration path is:

1. **Add EventDispatcher** to composition root
2. **Convert ProcessingService** to publish events instead of direct calls
3. **Add subscriptions** to existing services
4. **Keep transactions** for synchronous, same-database operations
5. **Later**: Move to async messaging if services need to be independently deployable

The key insight: domain events and orchestration aren't mutually exclusive. You can start with orchestration and introduce events incrementally as complexity grows.

## References

- [Domain-Driven Design by Eric Evans](https://www.domainlanguage.com/ddd/)
- [Implementing Domain-Driven Design by Vaughn Vernon](https://www.oreilly.com/library/view/implementing-domain-driven-design/9780133039900/)
- [Martin Fowler on Domain Events](https://martinfowler.com/eaaDev/DomainEvent.html)

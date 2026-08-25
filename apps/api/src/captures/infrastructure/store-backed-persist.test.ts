import { describe, it, expect } from 'vitest';
import { createFakeCaptureStore } from './fake-capture-store.js';
import { createStoreBackedPersist } from './store-backed-persist.js';

describe('createStoreBackedPersist', () => {
  it('projects CaptureCreated onto the store', async () => {
    const store = createFakeCaptureStore();
    const persist = createStoreBackedPersist(store);

    const result = await persist({
      event: {
        type: 'CaptureCreated',
        id: 'capture-id-1',
        organizationId: 'org-123',
        createdById: 'user-456',
        content: 'My text',
        capturedAt: '2025-01-15T10:00:00.000Z',
      },
      current: null,
    });

    expect(result.isOk()).toBe(true);

    const loaded = await store.findById('capture-id-1');
    expect(loaded.isOk()).toBe(true);
    if (loaded.isOk()) {
      expect(loaded.value).toEqual({
        id: 'capture-id-1',
        organizationId: 'org-123',
        createdById: 'user-456',
        content: 'My text',
        status: 'inbox',
        capturedAt: '2025-01-15T10:00:00.000Z',
      });
    }
  });

  it('projects CaptureTrashed onto the store', async () => {
    const store = createFakeCaptureStore({
      initialCaptures: [
        {
          id: 'capture-123',
          organizationId: 'org-123',
          createdById: 'user-456',
          content: 'Content',
          status: 'inbox',
          capturedAt: '2025-01-15T10:00:00.000Z',
          snoozedUntil: '2025-01-20T10:00:00.000Z',
        },
      ],
    });
    const persist = createStoreBackedPersist(store);

    const current = {
      id: 'capture-123',
      organizationId: 'org-123',
      createdById: 'user-456',
      content: 'Content',
      status: 'inbox' as const,
      capturedAt: '2025-01-15T10:00:00.000Z',
      snoozedUntil: '2025-01-20T10:00:00.000Z',
    };
    const result = await persist({
      event: {
        type: 'CaptureTrashed',
        id: 'capture-123',
        organizationId: 'org-123',
        trashedAt: '2025-01-16T10:00:00.000Z',
      },
      current,
    });

    expect(result.isOk()).toBe(true);

    const loaded = await store.findById('capture-123');
    expect(loaded.isOk()).toBe(true);
    if (loaded.isOk() && loaded.value) {
      expect(loaded.value.status).toBe('trashed');
      expect(loaded.value.trashedAt).toBe('2025-01-16T10:00:00.000Z');
      expect(loaded.value.snoozedUntil).toBeUndefined();
    }
  });

  it('soft-deletes on CaptureDeleted', async () => {
    const store = createFakeCaptureStore({
      initialCaptures: [
        {
          id: 'capture-123',
          organizationId: 'org-123',
          createdById: 'user-456',
          content: 'Content',
          status: 'trashed',
          capturedAt: '2025-01-15T10:00:00.000Z',
          trashedAt: '2025-01-15T12:00:00.000Z',
        },
      ],
    });
    const persist = createStoreBackedPersist(store);

    const result = await persist({
      event: {
        type: 'CaptureDeleted',
        id: 'capture-123',
        organizationId: 'org-123',
      },
      current: {
        id: 'capture-123',
        organizationId: 'org-123',
        createdById: 'user-456',
        content: 'Content',
        status: 'trashed',
        capturedAt: '2025-01-15T10:00:00.000Z',
        trashedAt: '2025-01-15T12:00:00.000Z',
      },
    });

    expect(result.isOk()).toBe(true);

    const loaded = await store.findById('capture-123');
    expect(loaded.isOk()).toBe(true);
    if (loaded.isOk()) {
      expect(loaded.value).toBeNull();
    }
  });

  it('empties trash on CaptureTrashEmptied and returns the count', async () => {
    const store = createFakeCaptureStore({
      initialCaptures: [
        {
          id: 'inbox-1',
          organizationId: 'org-123',
          createdById: 'user-456',
          content: 'Inbox',
          status: 'inbox',
          capturedAt: '2025-01-15T10:00:00.000Z',
        },
        {
          id: 'trashed-1',
          organizationId: 'org-123',
          createdById: 'user-456',
          content: 'Trashed',
          status: 'trashed',
          capturedAt: '2025-01-15T10:00:00.000Z',
          trashedAt: '2025-01-15T12:00:00.000Z',
        },
      ],
    });
    const persist = createStoreBackedPersist(store);

    const result = await persist({
      event: { type: 'CaptureTrashEmptied', organizationId: 'org-123' },
      current: null,
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.deletedCount).toBe(1);
    }
  });

  it('applies update events onto the provided current, not a reloaded row', async () => {
    const store = createFakeCaptureStore({
      initialCaptures: [
        {
          id: 'capture-123',
          organizationId: 'org-123',
          createdById: 'user-456',
          content: 'Store content',
          title: 'Store title',
          status: 'inbox',
          capturedAt: '2025-01-15T10:00:00.000Z',
        },
      ],
    });
    const persist = createStoreBackedPersist(store);

    const result = await persist({
      event: {
        type: 'CaptureContentUpdated',
        id: 'capture-123',
        organizationId: 'org-123',
        content: 'Handler content',
      },
      current: {
        id: 'capture-123',
        organizationId: 'org-123',
        createdById: 'user-456',
        content: 'Handler content was already decided',
        title: 'Handler title',
        status: 'inbox',
        capturedAt: '2025-01-15T10:00:00.000Z',
      },
    });

    expect(result.isOk()).toBe(true);

    const loaded = await store.findById('capture-123');
    expect(loaded.isOk()).toBe(true);
    if (loaded.isOk() && loaded.value) {
      expect(loaded.value.content).toBe('Handler content');
      expect(loaded.value.title).toBe('Handler title');
    }
  });

  it('propagates store save failures', async () => {
    const store = createFakeCaptureStore({ shouldFailOnSave: true });
    const persist = createStoreBackedPersist(store);

    const result = await persist({
      event: {
        type: 'CaptureCreated',
        id: 'capture-id-1',
        organizationId: 'org-123',
        createdById: 'user-456',
        content: 'My text',
        capturedAt: '2025-01-15T10:00:00.000Z',
      },
      current: null,
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('STORAGE_ERROR');
    }
  });
});

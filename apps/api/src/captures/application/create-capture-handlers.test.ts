import { describe, it, expect } from 'vitest';
import { createCaptureHandlers } from './create-capture-handlers.js';
import { createFakeCaptureStore } from '../infrastructure/fake-capture-store.js';
import { createStoreBackedPersist } from '../infrastructure/store-backed-persist.js';
import { createFakeClock, createFakeIdGenerator } from '@yoink/infrastructure';
import type { Capture } from '@yoink/api-contracts';
import type { CaptureStore } from '../domain/capture-store.js';

const createHandlers = (store: CaptureStore) => {
  const clock = createFakeClock(new Date('2025-01-16T10:00:00.000Z'));
  const idGenerator = createFakeIdGenerator(['capture-id-1', 'capture-id-2']);
  return createCaptureHandlers({
    persist: createStoreBackedPersist(store),
    load: (id) => store.findById(id),
    list: (options) => store.findByOrganization(options),
    nextId: () => idGenerator.generate(),
    now: () => clock.now().toISOString(),
  });
};

const inboxCapture: Capture = {
  id: 'capture-123',
  organizationId: 'org-123',
  createdById: 'user-456',
  content: 'Content',
  status: 'inbox',
  capturedAt: '2025-01-15T10:00:00.000Z',
};

describe('createCaptureHandlers', () => {
  describe('create', () => {
    it('persists a CaptureCreated fact and returns the projected view', async () => {
      const store = createFakeCaptureStore();
      const handlers = createHandlers(store);

      const result = await handlers.create({
        content: 'My text',
        organizationId: 'org-123',
        createdById: 'user-456',
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.event.type).toBe('CaptureCreated');
        expect(result.value.view).toEqual({
          id: 'capture-id-1',
          organizationId: 'org-123',
          createdById: 'user-456',
          content: 'My text',
          status: 'inbox',
          capturedAt: '2025-01-16T10:00:00.000Z',
        });
      }
    });

    it('returns storage error when persist fails', async () => {
      const store = createFakeCaptureStore({ shouldFailOnSave: true });
      const handlers = createHandlers(store);

      const result = await handlers.create({
        content: 'My text',
        organizationId: 'org-123',
        createdById: 'user-456',
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.type).toBe('STORAGE_ERROR');
      }
    });
  });

  describe('find', () => {
    it('returns the capture when it exists in the organization', async () => {
      const store = createFakeCaptureStore({ initialCaptures: [inboxCapture] });
      const handlers = createHandlers(store);

      const result = await handlers.find({
        id: 'capture-123',
        organizationId: 'org-123',
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toEqual(inboxCapture);
      }
    });

    it('returns not found when missing or in another organization', async () => {
      const store = createFakeCaptureStore({
        initialCaptures: [{ ...inboxCapture, organizationId: 'other-org' }],
      });
      const handlers = createHandlers(store);

      const missing = await handlers.find({
        id: 'nope',
        organizationId: 'org-123',
      });
      const wrongOrg = await handlers.find({
        id: 'capture-123',
        organizationId: 'org-123',
      });

      expect(missing.isErr()).toBe(true);
      expect(wrongOrg.isErr()).toBe(true);
      if (missing.isErr()) {
        expect(missing.error.type).toBe('CAPTURE_NOT_FOUND');
      }
    });
  });

  describe('list', () => {
    it('returns captures from the load port', async () => {
      const store = createFakeCaptureStore({ initialCaptures: [inboxCapture] });
      const handlers = createHandlers(store);

      const result = await handlers.list({ organizationId: 'org-123' });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.captures).toHaveLength(1);
        expect(result.value.captures[0].content).toBe('Content');
      }
    });
  });

  describe('trash', () => {
    it('persists CaptureTrashed and returns the updated view', async () => {
      const store = createFakeCaptureStore({ initialCaptures: [inboxCapture] });
      const handlers = createHandlers(store);

      const result = await handlers.trash({
        id: 'capture-123',
        organizationId: 'org-123',
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.event?.type).toBe('CaptureTrashed');
        expect(result.value.view.status).toBe('trashed');
        expect(result.value.view.trashedAt).toBe('2025-01-16T10:00:00.000Z');
      }
    });

    it('does not persist when already trashed', async () => {
      const store = createFakeCaptureStore({
        initialCaptures: [
          {
            ...inboxCapture,
            status: 'trashed',
            trashedAt: '2025-01-15T12:00:00.000Z',
          },
        ],
      });
      const handlers = createHandlers(store);

      const result = await handlers.trash({
        id: 'capture-123',
        organizationId: 'org-123',
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.event).toBeNull();
        expect(result.value.view.trashedAt).toBe('2025-01-15T12:00:00.000Z');
      }
    });
  });

  describe('restore', () => {
    it('persists CaptureRestored', async () => {
      const store = createFakeCaptureStore({
        initialCaptures: [
          {
            ...inboxCapture,
            status: 'trashed',
            trashedAt: '2025-01-15T12:00:00.000Z',
          },
        ],
      });
      const handlers = createHandlers(store);

      const result = await handlers.restore({
        id: 'capture-123',
        organizationId: 'org-123',
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.event?.type).toBe('CaptureRestored');
        expect(result.value.view.status).toBe('inbox');
        expect(result.value.view.trashedAt).toBeUndefined();
      }
    });
  });

  describe('update', () => {
    it('persists CaptureContentUpdated', async () => {
      const store = createFakeCaptureStore({ initialCaptures: [inboxCapture] });
      const handlers = createHandlers(store);

      const result = await handlers.update({
        id: 'capture-123',
        organizationId: 'org-123',
        content: 'Updated content',
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.event?.type).toBe('CaptureContentUpdated');
        expect(result.value.view.content).toBe('Updated content');
      }
    });
  });

  describe('snooze', () => {
    it('persists CaptureSnoozed', async () => {
      const store = createFakeCaptureStore({ initialCaptures: [inboxCapture] });
      const handlers = createHandlers(store);

      const result = await handlers.snooze({
        id: 'capture-123',
        organizationId: 'org-123',
        until: '2025-01-20T10:00:00.000Z',
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.event?.type).toBe('CaptureSnoozed');
        expect(result.value.view.snoozedUntil).toBe('2025-01-20T10:00:00.000Z');
      }
    });

    it('rejects snoozing a trashed capture', async () => {
      const store = createFakeCaptureStore({
        initialCaptures: [{ ...inboxCapture, status: 'trashed' }],
      });
      const handlers = createHandlers(store);

      const result = await handlers.snooze({
        id: 'capture-123',
        organizationId: 'org-123',
        until: '2025-01-20T10:00:00.000Z',
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.type).toBe('CAPTURE_ALREADY_TRASHED');
      }
    });
  });

  describe('unsnooze', () => {
    it('persists CaptureUnsnoozed', async () => {
      const store = createFakeCaptureStore({
        initialCaptures: [
          { ...inboxCapture, snoozedUntil: '2025-01-20T10:00:00.000Z' },
        ],
      });
      const handlers = createHandlers(store);

      const result = await handlers.unsnooze({
        id: 'capture-123',
        organizationId: 'org-123',
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.event?.type).toBe('CaptureUnsnoozed');
        expect(result.value.view.snoozedUntil).toBeUndefined();
      }
    });
  });

  describe('delete', () => {
    it('persists CaptureDeleted for a trashed capture', async () => {
      const store = createFakeCaptureStore({
        initialCaptures: [
          {
            ...inboxCapture,
            status: 'trashed',
            trashedAt: '2025-01-15T12:00:00.000Z',
          },
        ],
      });
      const handlers = createHandlers(store);

      const result = await handlers.delete({
        id: 'capture-123',
        organizationId: 'org-123',
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.type).toBe('CaptureDeleted');
      }

      const found = await handlers.find({
        id: 'capture-123',
        organizationId: 'org-123',
      });
      expect(found.isErr()).toBe(true);
    });

    it('rejects deleting an inbox capture', async () => {
      const store = createFakeCaptureStore({ initialCaptures: [inboxCapture] });
      const handlers = createHandlers(store);

      const result = await handlers.delete({
        id: 'capture-123',
        organizationId: 'org-123',
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.type).toBe('CAPTURE_NOT_IN_TRASH');
      }
    });
  });

  describe('emptyTrash', () => {
    it('returns the deleted count', async () => {
      const store = createFakeCaptureStore({
        initialCaptures: [
          inboxCapture,
          {
            ...inboxCapture,
            id: 'trashed-1',
            status: 'trashed',
            trashedAt: '2025-01-15T12:00:00.000Z',
          },
          {
            ...inboxCapture,
            id: 'trashed-2',
            status: 'trashed',
            trashedAt: '2025-01-15T12:00:00.000Z',
          },
        ],
      });
      const handlers = createHandlers(store);

      const result = await handlers.emptyTrash({ organizationId: 'org-123' });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.event).toEqual({
          type: 'CaptureTrashEmptied',
          organizationId: 'org-123',
        });
        expect(result.value.deletedCount).toBe(2);
      }
    });
  });
});

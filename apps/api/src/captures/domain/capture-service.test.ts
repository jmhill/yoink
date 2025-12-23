import { describe, it, expect } from 'vitest';
import { createCaptureService } from './capture-service.js';
import { createFakeCaptureStore } from '../infrastructure/fake-capture-store.js';
import { createFakeClock, createFakeIdGenerator } from '@yoink/infrastructure';

describe('createCaptureService', () => {
  describe('create', () => {
    it('creates a capture with generated id and timestamp', async () => {
      const store = createFakeCaptureStore();
      const clock = createFakeClock(new Date('2025-01-15T10:00:00.000Z'));
      const idGenerator = createFakeIdGenerator(['capture-id-1']);
      const service = createCaptureService({ store, clock, idGenerator });

      const result = await service.create({
        content: 'My text',
        organizationId: 'org-123',
        createdById: 'user-456',
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toEqual({
          id: 'capture-id-1',
          organizationId: 'org-123',
          createdById: 'user-456',
          content: 'My text',
          status: 'inbox',
          capturedAt: '2025-01-15T10:00:00.000Z',
        });
      }
    });

    it('persists capture to store', async () => {
      const store = createFakeCaptureStore();
      const clock = createFakeClock(new Date('2025-01-15T10:00:00.000Z'));
      const idGenerator = createFakeIdGenerator();
      const service = createCaptureService({ store, clock, idGenerator });

      await service.create({
        content: 'My text',
        organizationId: 'org-123',
        createdById: 'user-456',
      });

      const listResult = await service.list({ organizationId: 'org-123' });
      expect(listResult.isOk()).toBe(true);
      if (listResult.isOk()) {
        expect(listResult.value.captures).toHaveLength(1);
        expect(listResult.value.captures[0].content).toBe('My text');
      }
    });

    it('includes optional fields when provided', async () => {
      const store = createFakeCaptureStore();
      const clock = createFakeClock(new Date('2025-01-15T10:00:00.000Z'));
      const idGenerator = createFakeIdGenerator();
      const service = createCaptureService({ store, clock, idGenerator });

      const result = await service.create({
        content: 'My text',
        title: 'A title',
        sourceUrl: 'https://example.com',
        sourceApp: 'browser-extension',
        organizationId: 'org-123',
        createdById: 'user-456',
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.title).toBe('A title');
        expect(result.value.sourceUrl).toBe('https://example.com');
        expect(result.value.sourceApp).toBe('browser-extension');
      }
    });

    it('generates unique ids for each capture', async () => {
      const store = createFakeCaptureStore();
      const clock = createFakeClock(new Date('2025-01-15T10:00:00.000Z'));
      const idGenerator = createFakeIdGenerator(['capture-id-1', 'capture-id-2']);
      const service = createCaptureService({ store, clock, idGenerator });

      const first = await service.create({
        content: 'First',
        organizationId: 'org-123',
        createdById: 'user-456',
      });

      const second = await service.create({
        content: 'Second',
        organizationId: 'org-123',
        createdById: 'user-456',
      });

      expect(first.isOk()).toBe(true);
      expect(second.isOk()).toBe(true);
      if (first.isOk() && second.isOk()) {
        expect(first.value.id).toBe('capture-id-1');
        expect(second.value.id).toBe('capture-id-2');
      }
    });

    it('returns error when store fails', async () => {
      const store = createFakeCaptureStore({ shouldFailOnSave: true });
      const clock = createFakeClock(new Date('2025-01-15T10:00:00.000Z'));
      const idGenerator = createFakeIdGenerator();
      const service = createCaptureService({ store, clock, idGenerator });

      const result = await service.create({
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

  describe('list', () => {
    it('returns captures from store', async () => {
      const store = createFakeCaptureStore();
      const clock = createFakeClock(new Date('2025-01-15T10:00:00.000Z'));
      const idGenerator = createFakeIdGenerator(['capture-id-1']);
      const service = createCaptureService({ store, clock, idGenerator });

      await service.create({
        content: 'Test content',
        organizationId: 'org-123',
        createdById: 'user-456',
      });

      const result = await service.list({ organizationId: 'org-123' });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.captures).toHaveLength(1);
        expect(result.value.captures[0].content).toBe('Test content');
      }
    });

    it('filters by status', async () => {
      const trashedCapture = {
        id: 'trashed-capture-id',
        organizationId: 'org-123',
        createdById: 'user-456',
        content: 'Trashed capture',
        status: 'trashed' as const,
        capturedAt: '2025-01-15T09:00:00.000Z',
      };
      const store = createFakeCaptureStore({ initialCaptures: [trashedCapture] });
      const clock = createFakeClock(new Date('2025-01-15T10:00:00.000Z'));
      const idGenerator = createFakeIdGenerator(['inbox-capture-id']);
      const service = createCaptureService({ store, clock, idGenerator });

      await service.create({
        content: 'Inbox capture',
        organizationId: 'org-123',
        createdById: 'user-456',
      });

      const result = await service.list({
        organizationId: 'org-123',
        status: 'inbox',
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.captures).toHaveLength(1);
        expect(result.value.captures[0].content).toBe('Inbox capture');
      }
    });

    it('returns error when store fails', async () => {
      const store = createFakeCaptureStore({ shouldFailOnFind: true });
      const clock = createFakeClock(new Date('2025-01-15T10:00:00.000Z'));
      const idGenerator = createFakeIdGenerator();
      const service = createCaptureService({ store, clock, idGenerator });

      const result = await service.list({ organizationId: 'org-123' });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.type).toBe('STORAGE_ERROR');
      }
    });
  });

  describe('findById', () => {
    it('returns capture when it exists in organization', async () => {
      const existingCapture = {
        id: 'capture-123',
        organizationId: 'org-123',
        createdById: 'user-456',
        content: 'Existing content',
        status: 'inbox' as const,
        capturedAt: '2025-01-15T10:00:00.000Z',
      };
      const store = createFakeCaptureStore({ initialCaptures: [existingCapture] });
      const clock = createFakeClock(new Date('2025-01-15T10:00:00.000Z'));
      const idGenerator = createFakeIdGenerator();
      const service = createCaptureService({ store, clock, idGenerator });

      const result = await service.findById({
        id: 'capture-123',
        organizationId: 'org-123',
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toEqual(existingCapture);
      }
    });

    it('returns not found error when capture does not exist', async () => {
      const store = createFakeCaptureStore();
      const clock = createFakeClock(new Date('2025-01-15T10:00:00.000Z'));
      const idGenerator = createFakeIdGenerator();
      const service = createCaptureService({ store, clock, idGenerator });

      const result = await service.findById({
        id: 'non-existent',
        organizationId: 'org-123',
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.type).toBe('CAPTURE_NOT_FOUND');
      }
    });

    it('returns not found error when capture belongs to different organization', async () => {
      const existingCapture = {
        id: 'capture-123',
        organizationId: 'other-org',
        createdById: 'user-456',
        content: 'Other org content',
        status: 'inbox' as const,
        capturedAt: '2025-01-15T10:00:00.000Z',
      };
      const store = createFakeCaptureStore({ initialCaptures: [existingCapture] });
      const clock = createFakeClock(new Date('2025-01-15T10:00:00.000Z'));
      const idGenerator = createFakeIdGenerator();
      const service = createCaptureService({ store, clock, idGenerator });

      const result = await service.findById({
        id: 'capture-123',
        organizationId: 'org-123',
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.type).toBe('CAPTURE_NOT_FOUND');
      }
    });

    it('returns error when store fails', async () => {
      const store = createFakeCaptureStore({ shouldFailOnFind: true });
      const clock = createFakeClock(new Date('2025-01-15T10:00:00.000Z'));
      const idGenerator = createFakeIdGenerator();
      const service = createCaptureService({ store, clock, idGenerator });

      const result = await service.findById({
        id: 'capture-123',
        organizationId: 'org-123',
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.type).toBe('STORAGE_ERROR');
      }
    });
  });

  describe('update', () => {
    it('updates capture content', async () => {
      const existingCapture = {
        id: 'capture-123',
        organizationId: 'org-123',
        createdById: 'user-456',
        content: 'Original content',
        status: 'inbox' as const,
        capturedAt: '2025-01-15T10:00:00.000Z',
      };
      const store = createFakeCaptureStore({ initialCaptures: [existingCapture] });
      const clock = createFakeClock(new Date('2025-01-16T10:00:00.000Z'));
      const idGenerator = createFakeIdGenerator();
      const service = createCaptureService({ store, clock, idGenerator });

      const result = await service.update({
        id: 'capture-123',
        organizationId: 'org-123',
        content: 'Updated content',
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.content).toBe('Updated content');
      }
    });

    it('updates capture title', async () => {
      const existingCapture = {
        id: 'capture-123',
        organizationId: 'org-123',
        createdById: 'user-456',
        content: 'Content',
        status: 'inbox' as const,
        capturedAt: '2025-01-15T10:00:00.000Z',
      };
      const store = createFakeCaptureStore({ initialCaptures: [existingCapture] });
      const clock = createFakeClock(new Date('2025-01-16T10:00:00.000Z'));
      const idGenerator = createFakeIdGenerator();
      const service = createCaptureService({ store, clock, idGenerator });

      const result = await service.update({
        id: 'capture-123',
        organizationId: 'org-123',
        title: 'New title',
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.title).toBe('New title');
      }
    });

    it('returns not found error when capture does not exist', async () => {
      const store = createFakeCaptureStore();
      const clock = createFakeClock(new Date('2025-01-16T10:00:00.000Z'));
      const idGenerator = createFakeIdGenerator();
      const service = createCaptureService({ store, clock, idGenerator });

      const result = await service.update({
        id: 'non-existent',
        organizationId: 'org-123',
        content: 'Updated',
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.type).toBe('CAPTURE_NOT_FOUND');
      }
    });

    it('returns not found error when capture belongs to different organization', async () => {
      const existingCapture = {
        id: 'capture-123',
        organizationId: 'other-org',
        createdById: 'user-456',
        content: 'Content',
        status: 'inbox' as const,
        capturedAt: '2025-01-15T10:00:00.000Z',
      };
      const store = createFakeCaptureStore({ initialCaptures: [existingCapture] });
      const clock = createFakeClock(new Date('2025-01-16T10:00:00.000Z'));
      const idGenerator = createFakeIdGenerator();
      const service = createCaptureService({ store, clock, idGenerator });

      const result = await service.update({
        id: 'capture-123',
        organizationId: 'org-123',
        content: 'Updated',
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.type).toBe('CAPTURE_NOT_FOUND');
      }
    });
  });

  describe('trash', () => {
    it('trashes a capture and sets trashedAt', async () => {
      const existingCapture = {
        id: 'capture-123',
        organizationId: 'org-123',
        createdById: 'user-456',
        content: 'Content',
        status: 'inbox' as const,
        capturedAt: '2025-01-15T10:00:00.000Z',
      };
      const store = createFakeCaptureStore({ initialCaptures: [existingCapture] });
      const clock = createFakeClock(new Date('2025-01-16T10:00:00.000Z'));
      const idGenerator = createFakeIdGenerator();
      const service = createCaptureService({ store, clock, idGenerator });

      const result = await service.trash({
        id: 'capture-123',
        organizationId: 'org-123',
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.status).toBe('trashed');
        expect(result.value.trashedAt).toBe('2025-01-16T10:00:00.000Z');
      }
    });

    it('clears pinnedAt when trashing', async () => {
      const existingCapture = {
        id: 'capture-123',
        organizationId: 'org-123',
        createdById: 'user-456',
        content: 'Content',
        status: 'inbox' as const,
        capturedAt: '2025-01-15T10:00:00.000Z',
        pinnedAt: '2025-01-15T11:00:00.000Z',
      };
      const store = createFakeCaptureStore({ initialCaptures: [existingCapture] });
      const clock = createFakeClock(new Date('2025-01-16T10:00:00.000Z'));
      const idGenerator = createFakeIdGenerator();
      const service = createCaptureService({ store, clock, idGenerator });

      const result = await service.trash({
        id: 'capture-123',
        organizationId: 'org-123',
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.pinnedAt).toBeUndefined();
      }
    });

    it('is idempotent - trashing already trashed capture succeeds', async () => {
      const existingCapture = {
        id: 'capture-123',
        organizationId: 'org-123',
        createdById: 'user-456',
        content: 'Content',
        status: 'trashed' as const,
        capturedAt: '2025-01-15T10:00:00.000Z',
        trashedAt: '2025-01-15T12:00:00.000Z',
      };
      const store = createFakeCaptureStore({ initialCaptures: [existingCapture] });
      const clock = createFakeClock(new Date('2025-01-16T10:00:00.000Z'));
      const idGenerator = createFakeIdGenerator();
      const service = createCaptureService({ store, clock, idGenerator });

      const result = await service.trash({
        id: 'capture-123',
        organizationId: 'org-123',
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.status).toBe('trashed');
        // Original trashedAt is preserved
        expect(result.value.trashedAt).toBe('2025-01-15T12:00:00.000Z');
      }
    });

    it('returns not found error when capture does not exist', async () => {
      const store = createFakeCaptureStore();
      const clock = createFakeClock(new Date('2025-01-16T10:00:00.000Z'));
      const idGenerator = createFakeIdGenerator();
      const service = createCaptureService({ store, clock, idGenerator });

      const result = await service.trash({
        id: 'non-existent',
        organizationId: 'org-123',
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.type).toBe('CAPTURE_NOT_FOUND');
      }
    });
  });

  describe('restore', () => {
    it('restores a capture and clears trashedAt', async () => {
      const existingCapture = {
        id: 'capture-123',
        organizationId: 'org-123',
        createdById: 'user-456',
        content: 'Content',
        status: 'trashed' as const,
        capturedAt: '2025-01-15T10:00:00.000Z',
        trashedAt: '2025-01-15T12:00:00.000Z',
      };
      const store = createFakeCaptureStore({ initialCaptures: [existingCapture] });
      const clock = createFakeClock(new Date('2025-01-16T10:00:00.000Z'));
      const idGenerator = createFakeIdGenerator();
      const service = createCaptureService({ store, clock, idGenerator });

      const result = await service.restore({
        id: 'capture-123',
        organizationId: 'org-123',
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.status).toBe('inbox');
        expect(result.value.trashedAt).toBeUndefined();
      }
    });

    it('is idempotent - restoring inbox capture succeeds', async () => {
      const existingCapture = {
        id: 'capture-123',
        organizationId: 'org-123',
        createdById: 'user-456',
        content: 'Content',
        status: 'inbox' as const,
        capturedAt: '2025-01-15T10:00:00.000Z',
      };
      const store = createFakeCaptureStore({ initialCaptures: [existingCapture] });
      const clock = createFakeClock(new Date('2025-01-16T10:00:00.000Z'));
      const idGenerator = createFakeIdGenerator();
      const service = createCaptureService({ store, clock, idGenerator });

      const result = await service.restore({
        id: 'capture-123',
        organizationId: 'org-123',
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.status).toBe('inbox');
      }
    });

    it('returns not found error when capture does not exist', async () => {
      const store = createFakeCaptureStore();
      const clock = createFakeClock(new Date('2025-01-16T10:00:00.000Z'));
      const idGenerator = createFakeIdGenerator();
      const service = createCaptureService({ store, clock, idGenerator });

      const result = await service.restore({
        id: 'non-existent',
        organizationId: 'org-123',
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.type).toBe('CAPTURE_NOT_FOUND');
      }
    });
  });

  describe('pin', () => {
    it('pins a capture and sets pinnedAt', async () => {
      const existingCapture = {
        id: 'capture-123',
        organizationId: 'org-123',
        createdById: 'user-456',
        content: 'Content',
        status: 'inbox' as const,
        capturedAt: '2025-01-15T10:00:00.000Z',
      };
      const store = createFakeCaptureStore({ initialCaptures: [existingCapture] });
      const clock = createFakeClock(new Date('2025-01-16T10:00:00.000Z'));
      const idGenerator = createFakeIdGenerator();
      const service = createCaptureService({ store, clock, idGenerator });

      const result = await service.pin({
        id: 'capture-123',
        organizationId: 'org-123',
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.pinnedAt).toBe('2025-01-16T10:00:00.000Z');
      }
    });

    it('is idempotent - pinning already pinned capture succeeds', async () => {
      const existingCapture = {
        id: 'capture-123',
        organizationId: 'org-123',
        createdById: 'user-456',
        content: 'Content',
        status: 'inbox' as const,
        capturedAt: '2025-01-15T10:00:00.000Z',
        pinnedAt: '2025-01-15T11:00:00.000Z',
      };
      const store = createFakeCaptureStore({ initialCaptures: [existingCapture] });
      const clock = createFakeClock(new Date('2025-01-16T10:00:00.000Z'));
      const idGenerator = createFakeIdGenerator();
      const service = createCaptureService({ store, clock, idGenerator });

      const result = await service.pin({
        id: 'capture-123',
        organizationId: 'org-123',
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        // Original pinnedAt is preserved
        expect(result.value.pinnedAt).toBe('2025-01-15T11:00:00.000Z');
      }
    });

    it('returns error when trying to pin trashed capture', async () => {
      const existingCapture = {
        id: 'capture-123',
        organizationId: 'org-123',
        createdById: 'user-456',
        content: 'Content',
        status: 'trashed' as const,
        capturedAt: '2025-01-15T10:00:00.000Z',
        trashedAt: '2025-01-15T12:00:00.000Z',
      };
      const store = createFakeCaptureStore({ initialCaptures: [existingCapture] });
      const clock = createFakeClock(new Date('2025-01-16T10:00:00.000Z'));
      const idGenerator = createFakeIdGenerator();
      const service = createCaptureService({ store, clock, idGenerator });

      const result = await service.pin({
        id: 'capture-123',
        organizationId: 'org-123',
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.type).toBe('CAPTURE_ALREADY_TRASHED');
      }
    });

    it('returns not found error when capture does not exist', async () => {
      const store = createFakeCaptureStore();
      const clock = createFakeClock(new Date('2025-01-16T10:00:00.000Z'));
      const idGenerator = createFakeIdGenerator();
      const service = createCaptureService({ store, clock, idGenerator });

      const result = await service.pin({
        id: 'non-existent',
        organizationId: 'org-123',
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.type).toBe('CAPTURE_NOT_FOUND');
      }
    });
  });

  describe('unpin', () => {
    it('unpins a capture and clears pinnedAt', async () => {
      const existingCapture = {
        id: 'capture-123',
        organizationId: 'org-123',
        createdById: 'user-456',
        content: 'Content',
        status: 'inbox' as const,
        capturedAt: '2025-01-15T10:00:00.000Z',
        pinnedAt: '2025-01-15T11:00:00.000Z',
      };
      const store = createFakeCaptureStore({ initialCaptures: [existingCapture] });
      const clock = createFakeClock(new Date('2025-01-16T10:00:00.000Z'));
      const idGenerator = createFakeIdGenerator();
      const service = createCaptureService({ store, clock, idGenerator });

      const result = await service.unpin({
        id: 'capture-123',
        organizationId: 'org-123',
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.pinnedAt).toBeUndefined();
      }
    });

    it('is idempotent - unpinning already unpinned capture succeeds', async () => {
      const existingCapture = {
        id: 'capture-123',
        organizationId: 'org-123',
        createdById: 'user-456',
        content: 'Content',
        status: 'inbox' as const,
        capturedAt: '2025-01-15T10:00:00.000Z',
      };
      const store = createFakeCaptureStore({ initialCaptures: [existingCapture] });
      const clock = createFakeClock(new Date('2025-01-16T10:00:00.000Z'));
      const idGenerator = createFakeIdGenerator();
      const service = createCaptureService({ store, clock, idGenerator });

      const result = await service.unpin({
        id: 'capture-123',
        organizationId: 'org-123',
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.pinnedAt).toBeUndefined();
      }
    });

    it('returns not found error when capture does not exist', async () => {
      const store = createFakeCaptureStore();
      const clock = createFakeClock(new Date('2025-01-16T10:00:00.000Z'));
      const idGenerator = createFakeIdGenerator();
      const service = createCaptureService({ store, clock, idGenerator });

      const result = await service.unpin({
        id: 'non-existent',
        organizationId: 'org-123',
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.type).toBe('CAPTURE_NOT_FOUND');
      }
    });
  });

  describe('delete', () => {
    it('permanently deletes a trashed capture', async () => {
      const existingCapture = {
        id: 'capture-123',
        organizationId: 'org-123',
        createdById: 'user-456',
        content: 'Content',
        status: 'trashed' as const,
        capturedAt: '2025-01-15T10:00:00.000Z',
        trashedAt: '2025-01-15T12:00:00.000Z',
      };
      const store = createFakeCaptureStore({ initialCaptures: [existingCapture] });
      const clock = createFakeClock(new Date('2025-01-16T10:00:00.000Z'));
      const idGenerator = createFakeIdGenerator();
      const service = createCaptureService({ store, clock, idGenerator });

      const result = await service.delete({
        id: 'capture-123',
        organizationId: 'org-123',
      });

      expect(result.isOk()).toBe(true);

      // Verify capture is no longer findable
      const findResult = await service.find({
        id: 'capture-123',
        organizationId: 'org-123',
      });
      expect(findResult.isErr()).toBe(true);
      if (findResult.isErr()) {
        expect(findResult.error.type).toBe('CAPTURE_NOT_FOUND');
      }
    });

    it('returns not in trash error when trying to delete inbox capture', async () => {
      const existingCapture = {
        id: 'capture-123',
        organizationId: 'org-123',
        createdById: 'user-456',
        content: 'Content',
        status: 'inbox' as const,
        capturedAt: '2025-01-15T10:00:00.000Z',
      };
      const store = createFakeCaptureStore({ initialCaptures: [existingCapture] });
      const clock = createFakeClock(new Date('2025-01-16T10:00:00.000Z'));
      const idGenerator = createFakeIdGenerator();
      const service = createCaptureService({ store, clock, idGenerator });

      const result = await service.delete({
        id: 'capture-123',
        organizationId: 'org-123',
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.type).toBe('CAPTURE_NOT_IN_TRASH');
      }
    });

    it('returns not found error when capture does not exist', async () => {
      const store = createFakeCaptureStore();
      const clock = createFakeClock(new Date('2025-01-16T10:00:00.000Z'));
      const idGenerator = createFakeIdGenerator();
      const service = createCaptureService({ store, clock, idGenerator });

      const result = await service.delete({
        id: 'non-existent',
        organizationId: 'org-123',
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.type).toBe('CAPTURE_NOT_FOUND');
      }
    });
  });

  describe('emptyTrash', () => {
    it('deletes all trashed captures for organization', async () => {
      const captures = [
        {
          id: 'inbox-1',
          organizationId: 'org-123',
          createdById: 'user-456',
          content: 'Inbox content',
          status: 'inbox' as const,
          capturedAt: '2025-01-15T10:00:00.000Z',
        },
        {
          id: 'trashed-1',
          organizationId: 'org-123',
          createdById: 'user-456',
          content: 'Trashed content 1',
          status: 'trashed' as const,
          capturedAt: '2025-01-15T10:00:00.000Z',
          trashedAt: '2025-01-15T12:00:00.000Z',
        },
        {
          id: 'trashed-2',
          organizationId: 'org-123',
          createdById: 'user-456',
          content: 'Trashed content 2',
          status: 'trashed' as const,
          capturedAt: '2025-01-15T10:00:00.000Z',
          trashedAt: '2025-01-15T12:00:00.000Z',
        },
      ];
      const store = createFakeCaptureStore({ initialCaptures: captures });
      const clock = createFakeClock(new Date('2025-01-16T10:00:00.000Z'));
      const idGenerator = createFakeIdGenerator();
      const service = createCaptureService({ store, clock, idGenerator });

      const result = await service.emptyTrash({ organizationId: 'org-123' });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.deletedCount).toBe(2);
      }

      // Verify inbox capture still exists
      const listResult = await service.list({
        organizationId: 'org-123',
        status: 'inbox',
      });
      expect(listResult.isOk()).toBe(true);
      if (listResult.isOk()) {
        expect(listResult.value.captures).toHaveLength(1);
        expect(listResult.value.captures[0].id).toBe('inbox-1');
      }

      // Verify trashed captures are gone
      const trashResult = await service.list({
        organizationId: 'org-123',
        status: 'trashed',
      });
      expect(trashResult.isOk()).toBe(true);
      if (trashResult.isOk()) {
        expect(trashResult.value.captures).toHaveLength(0);
      }
    });

    it('returns zero count when trash is empty', async () => {
      const store = createFakeCaptureStore();
      const clock = createFakeClock(new Date('2025-01-16T10:00:00.000Z'));
      const idGenerator = createFakeIdGenerator();
      const service = createCaptureService({ store, clock, idGenerator });

      const result = await service.emptyTrash({ organizationId: 'org-123' });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.deletedCount).toBe(0);
      }
    });
  });
});

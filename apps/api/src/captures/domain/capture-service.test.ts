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
      const archivedCapture = {
        id: 'archived-capture-id',
        organizationId: 'org-123',
        createdById: 'user-456',
        content: 'Archived capture',
        status: 'archived' as const,
        capturedAt: '2025-01-15T09:00:00.000Z',
      };
      const store = createFakeCaptureStore({ initialCaptures: [archivedCapture] });
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
});

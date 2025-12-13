import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createCaptureService } from './capture-service.js';
import type { CaptureStore } from './capture-store.js';
import { createFakeClock, createFakeIdGenerator } from '@yoink/infrastructure';
import type { Capture } from '@yoink/api-contracts';

const createMockStore = (): CaptureStore => ({
  save: vi.fn().mockResolvedValue(undefined),
  findByOrganization: vi.fn().mockResolvedValue({ captures: [] }),
});

const createTestCapture = (overrides: Partial<Capture> = {}): Capture => ({
  id: 'capture-id-1',
  organizationId: 'org-123',
  createdById: 'user-456',
  content: 'Test content',
  status: 'inbox',
  capturedAt: '2025-01-15T10:00:00.000Z',
  ...overrides,
});

describe('createCaptureService', () => {
  let store: CaptureStore;

  beforeEach(() => {
    store = createMockStore();
  });

  describe('create', () => {
    it('creates a capture with generated id and timestamp', async () => {
      const clock = createFakeClock(new Date('2025-01-15T10:00:00.000Z'));
      const idGenerator = createFakeIdGenerator(['capture-id-1']);
      const service = createCaptureService({ store, clock, idGenerator });

      const result = await service.create({
        content: 'My text',
        organizationId: 'org-123',
        createdById: 'user-456',
      });

      expect(result).toEqual({
        id: 'capture-id-1',
        organizationId: 'org-123',
        createdById: 'user-456',
        content: 'My text',
        status: 'inbox',
        capturedAt: '2025-01-15T10:00:00.000Z',
      });
    });

    it('saves capture to store', async () => {
      const clock = createFakeClock(new Date('2025-01-15T10:00:00.000Z'));
      const idGenerator = createFakeIdGenerator();
      const service = createCaptureService({ store, clock, idGenerator });

      await service.create({
        content: 'My text',
        organizationId: 'org-123',
        createdById: 'user-456',
      });

      expect(store.save).toHaveBeenCalledWith(
        expect.objectContaining({ content: 'My text' })
      );
    });

    it('includes optional fields when provided', async () => {
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

      expect(result.title).toBe('A title');
      expect(result.sourceUrl).toBe('https://example.com');
      expect(result.sourceApp).toBe('browser-extension');
    });

    it('generates unique ids for each capture', async () => {
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

      expect(first.id).toBe('capture-id-1');
      expect(second.id).toBe('capture-id-2');
    });
  });

  describe('list', () => {
    it('returns captures from store', async () => {
      const clock = createFakeClock(new Date('2025-01-15T10:00:00.000Z'));
      const idGenerator = createFakeIdGenerator();
      const service = createCaptureService({ store, clock, idGenerator });

      const mockCaptures = [createTestCapture()];
      vi.mocked(store.findByOrganization).mockResolvedValue({
        captures: mockCaptures,
      });

      const result = await service.list({ organizationId: 'org-123' });

      expect(result.captures).toEqual(mockCaptures);
    });

    it('passes filter options to store', async () => {
      const clock = createFakeClock(new Date('2025-01-15T10:00:00.000Z'));
      const idGenerator = createFakeIdGenerator();
      const service = createCaptureService({ store, clock, idGenerator });

      await service.list({
        organizationId: 'org-123',
        status: 'inbox',
        limit: 25,
      });

      expect(store.findByOrganization).toHaveBeenCalledWith({
        organizationId: 'org-123',
        status: 'inbox',
        limit: 25,
      });
    });

    it('returns nextCursor from store', async () => {
      const clock = createFakeClock(new Date('2025-01-15T10:00:00.000Z'));
      const idGenerator = createFakeIdGenerator();
      const service = createCaptureService({ store, clock, idGenerator });

      vi.mocked(store.findByOrganization).mockResolvedValue({
        captures: [],
        nextCursor: 'next-cursor-id',
      });

      const result = await service.list({ organizationId: 'org-123' });

      expect(result.nextCursor).toBe('next-cursor-id');
    });
  });
});

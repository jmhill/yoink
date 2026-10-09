import { describe, it, expect, beforeEach } from 'vitest';
import type { Capture } from '@yoink/api-contracts';
import type { CaptureStore } from './capture-store.js';

const createTestCapture = (overrides: Partial<Capture> = {}): Capture => ({
  id: `capture-${Math.random().toString(36).slice(2)}`,
  organizationId: 'org-123',
  createdById: 'user-456',
  content: 'Test content',
  status: 'inbox',
  capturedAt: '2025-01-15T10:00:00.000Z',
  ...overrides,
});

export type CaptureStoreContractOptions = {
  createStore: () => CaptureStore | Promise<CaptureStore>;
  beforeEach?: () => void | Promise<void>;
  afterEach?: () => void | Promise<void>;
};

export const runCaptureStoreContractTests = (
  options: CaptureStoreContractOptions
) => {
  let store: CaptureStore;

  beforeEach(async () => {
    if (options.beforeEach) await options.beforeEach();
    store = await options.createStore();
  });

  describe('CaptureStore Contract', () => {
    describe('save', () => {
      it('persists a capture', async () => {
        const capture = createTestCapture({ content: 'Test content' });

        const saveResult = await store.save(capture);
        expect(saveResult.isOk()).toBe(true);

        const findResult = await store.findByOrganization({
          organizationId: capture.organizationId,
        });
        expect(findResult.isOk()).toBe(true);
        if (findResult.isOk()) {
          expect(findResult.value.captures).toHaveLength(1);
          expect(findResult.value.captures[0]).toEqual(capture);
        }
      });

      it('persists capture with optional fields', async () => {
        const capture = createTestCapture({
          title: 'A title',
          sourceUrl: 'https://example.com',
          sourceApp: 'browser-extension',
        });

        const saveResult = await store.save(capture);
        expect(saveResult.isOk()).toBe(true);

        const findResult = await store.findByOrganization({
          organizationId: capture.organizationId,
        });
        expect(findResult.isOk()).toBe(true);
        if (findResult.isOk()) {
          expect(findResult.value.captures[0].title).toBe('A title');
          expect(findResult.value.captures[0].sourceUrl).toBe(
            'https://example.com'
          );
          expect(findResult.value.captures[0].sourceApp).toBe(
            'browser-extension'
          );
        }
      });
    });

    describe('findByOrganization', () => {
      it('returns captures for organization only', async () => {
        const org1Capture = createTestCapture({
          organizationId: 'org-1',
          content: 'Org 1',
        });
        const org2Capture = createTestCapture({
          organizationId: 'org-2',
          content: 'Org 2',
        });

        await store.save(org1Capture);
        await store.save(org2Capture);

        const result = await store.findByOrganization({ organizationId: 'org-1' });

        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
          expect(result.value.captures).toHaveLength(1);
          expect(result.value.captures[0].content).toBe('Org 1');
        }
      });

      it('returns captures in newest-first order', async () => {
        const older = createTestCapture({
          id: 'older-id',
          capturedAt: '2025-01-15T10:00:00.000Z',
          content: 'Older',
        });
        const newer = createTestCapture({
          id: 'newer-id',
          capturedAt: '2025-01-15T11:00:00.000Z',
          content: 'Newer',
        });

        await store.save(older);
        await store.save(newer);

        const result = await store.findByOrganization({
          organizationId: older.organizationId,
        });

        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
          expect(result.value.captures[0].content).toBe('Newer');
          expect(result.value.captures[1].content).toBe('Older');
        }
      });

      it('filters by status', async () => {
        const inbox = createTestCapture({ id: 'inbox-id', status: 'inbox' });
        const trashed = createTestCapture({
          id: 'trashed-id',
          status: 'trashed',
        });

        await store.save(inbox);
        await store.save(trashed);

        const result = await store.findByOrganization({
          organizationId: inbox.organizationId,
          status: 'inbox',
        });

        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
          expect(result.value.captures).toHaveLength(1);
          expect(result.value.captures[0].status).toBe('inbox');
        }
      });

      it('limits results', async () => {
        for (let i = 0; i < 5; i++) {
          await store.save(createTestCapture({ id: `capture-${i}` }));
        }

        const result = await store.findByOrganization({
          organizationId: 'org-123',
          limit: 2,
        });

        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
          expect(result.value.captures).toHaveLength(2);
          expect(result.value.hasMore).toBe(true);
          expect(result.value.nextCursor).toBe(result.value.captures[1]?.id);
          expect(result.value.total).toBe(5);
        }
      });

      it('pages without gaps or duplicates', async () => {
        for (let i = 0; i < 5; i++) {
          await store.save(
            createTestCapture({
              id: `capture-page-${i}`,
              capturedAt: `2025-01-15T1${i}:00:00.000Z`,
            })
          );
        }

        const first = await store.findByOrganization({
          organizationId: 'org-123',
          limit: 2,
        });
        expect(first.isOk()).toBe(true);
        if (!first.isOk()) return;

        const second = await store.findByOrganization({
          organizationId: 'org-123',
          limit: 2,
          cursor: first.value.nextCursor ?? undefined,
        });
        expect(second.isOk()).toBe(true);
        if (!second.isOk()) return;

        const third = await store.findByOrganization({
          organizationId: 'org-123',
          limit: 2,
          cursor: second.value.nextCursor ?? undefined,
        });
        expect(third.isOk()).toBe(true);
        if (!third.isOk()) return;

        const ids = [
          ...first.value.captures,
          ...second.value.captures,
          ...third.value.captures,
        ].map((capture) => capture.id);
        expect(ids).toHaveLength(5);
        expect(new Set(ids).size).toBe(5);
        expect(first.value.hasMore).toBe(true);
        expect(second.value.hasMore).toBe(true);
        expect(third.value.hasMore).toBe(false);
        expect(third.value.nextCursor).toBeNull();
      });

      it('reports hasMore when the safety cap is hit', async () => {
        const cap = 8;
        for (let i = 0; i < cap + 1; i++) {
          await store.save(
            createTestCapture({
              id: `capture-cap-${i}`,
              capturedAt: `2025-01-16T${String(i).padStart(2, '0')}:00:00.000Z`,
            })
          );
        }

        const result = await store.findByOrganization({
          organizationId: 'org-123',
          limit: cap,
        });

        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
          expect(result.value.captures).toHaveLength(cap);
          expect(result.value.hasMore).toBe(true);
          expect(result.value.nextCursor).toBe(
            result.value.captures[cap - 1]?.id
          );
          expect(result.value.total).toBe(cap + 1);
        }
      });

      it('returns empty array when no captures exist', async () => {
        const result = await store.findByOrganization({
          organizationId: 'non-existent-org',
        });

        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
          expect(result.value.captures).toEqual([]);
        }
      });
    });

    describe('findById', () => {
      it('returns capture when it exists', async () => {
        const capture = createTestCapture({ id: 'capture-123' });
        await store.save(capture);

        const result = await store.findById('capture-123');

        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
          expect(result.value).toEqual(capture);
        }
      });

      it('returns null when capture does not exist', async () => {
        const result = await store.findById('non-existent-id');

        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
          expect(result.value).toBeNull();
        }
      });

      it('returns capture regardless of organization', async () => {
        const capture = createTestCapture({
          id: 'capture-456',
          organizationId: 'some-org',
        });
        await store.save(capture);

        const result = await store.findById('capture-456');

        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
          expect(result.value?.organizationId).toBe('some-org');
        }
      });
    });

    describe('update', () => {
      it('updates capture content', async () => {
        const capture = createTestCapture({ id: 'capture-123', content: 'Original' });
        await store.save(capture);

        const updatedCapture = { ...capture, content: 'Updated content' };
        const updateResult = await store.update(updatedCapture);

        expect(updateResult.isOk()).toBe(true);

        const findResult = await store.findById('capture-123');
        expect(findResult.isOk()).toBe(true);
        if (findResult.isOk()) {
          expect(findResult.value?.content).toBe('Updated content');
        }
      });

      it('updates capture status and trashedAt', async () => {
        const capture = createTestCapture({ id: 'capture-123', status: 'inbox' });
        await store.save(capture);

        const updatedCapture = {
          ...capture,
          status: 'trashed' as const,
          trashedAt: '2025-01-16T10:00:00.000Z',
        };
        await store.update(updatedCapture);

        const findResult = await store.findById('capture-123');
        expect(findResult.isOk()).toBe(true);
        if (findResult.isOk()) {
          expect(findResult.value?.status).toBe('trashed');
          expect(findResult.value?.trashedAt).toBe('2025-01-16T10:00:00.000Z');
        }
      });

      it('updates capture title', async () => {
        const capture = createTestCapture({ id: 'capture-123' });
        await store.save(capture);

        const updatedCapture = { ...capture, title: 'New title' };
        await store.update(updatedCapture);

        const findResult = await store.findById('capture-123');
        expect(findResult.isOk()).toBe(true);
        if (findResult.isOk()) {
          expect(findResult.value?.title).toBe('New title');
        }
      });

      it('clears trashedAt when restoring', async () => {
        const capture = createTestCapture({
          id: 'capture-123',
          status: 'trashed',
          trashedAt: '2025-01-16T10:00:00.000Z',
        });
        await store.save(capture);

        const updatedCapture = {
          ...capture,
          status: 'inbox' as const,
          trashedAt: undefined,
        };
        await store.update(updatedCapture);

        const findResult = await store.findById('capture-123');
        expect(findResult.isOk()).toBe(true);
        if (findResult.isOk()) {
          expect(findResult.value?.status).toBe('inbox');
          expect(findResult.value?.trashedAt).toBeUndefined();
        }
      });
    });
  });
};

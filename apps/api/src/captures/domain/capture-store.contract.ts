import { describe, it, expect, beforeEach } from 'vitest';
import type { Capture } from '@yoink/api-contracts';
import type { CaptureStore } from './capture-store.js';
import { captureFeedKeys } from '../../listing/domain/list-keys.js';

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
          fetchLimit: 10,
        });
        expect(findResult.isOk()).toBe(true);
        if (findResult.isOk()) {
          expect(findResult.value.rows).toHaveLength(1);
          expect(findResult.value.rows[0]).toEqual(capture);
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
          fetchLimit: 10,
        });
        expect(findResult.isOk()).toBe(true);
        if (findResult.isOk()) {
          expect(findResult.value.rows[0]?.title).toBe('A title');
          expect(findResult.value.rows[0]?.sourceUrl).toBe(
            'https://example.com'
          );
          expect(findResult.value.rows[0]?.sourceApp).toBe(
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

        const result = await store.findByOrganization({
          organizationId: 'org-1',
          fetchLimit: 10,
        });

        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
          expect(result.value.rows).toHaveLength(1);
          expect(result.value.rows[0]?.content).toBe('Org 1');
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
          fetchLimit: 10,
        });

        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
          expect(result.value.rows[0]?.content).toBe('Newer');
          expect(result.value.rows[1]?.content).toBe('Older');
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
          fetchLimit: 10,
        });

        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
          expect(result.value.rows).toHaveLength(1);
          expect(result.value.rows[0]?.status).toBe('inbox');
        }
      });

      it('applies LIMIT mechanically and reports total', async () => {
        for (let i = 0; i < 5; i++) {
          await store.save(createTestCapture({ id: `capture-${i}` }));
        }

        const result = await store.findByOrganization({
          organizationId: 'org-123',
          fetchLimit: 2,
        });

        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
          expect(result.value.rows).toHaveLength(2);
          expect(result.value.total).toBe(5);
        }
      });

      it('resumes with a keyset seek and keeps remaining rows when the seek item is gone', async () => {
        const captures = [
          createTestCapture({
            id: 'capture-page-0',
            capturedAt: '2025-01-15T12:00:00.000Z',
          }),
          createTestCapture({
            id: 'capture-page-1',
            capturedAt: '2025-01-15T11:00:00.000Z',
          }),
          createTestCapture({
            id: 'capture-page-2',
            capturedAt: '2025-01-15T10:00:00.000Z',
          }),
        ];
        for (const capture of captures) {
          await store.save(capture);
        }

        const first = await store.findByOrganization({
          organizationId: 'org-123',
          fetchLimit: 2,
        });
        expect(first.isOk()).toBe(true);
        if (!first.isOk()) return;
        const cursorItem = first.value.rows[1];
        expect(cursorItem?.id).toBe('capture-page-1');
        if (!cursorItem) return;

        await store.softDelete(cursorItem.id);

        const remaining = await store.findByOrganization({
          organizationId: 'org-123',
          fetchLimit: 10,
          seek: { keys: captureFeedKeys(cursorItem) },
        });
        expect(remaining.isOk()).toBe(true);
        if (!remaining.isOk()) return;
        expect(remaining.value.rows.map((capture) => capture.id)).toEqual([
          'capture-page-2',
        ]);
        expect(remaining.value.total).toBe(2);
      });

      it('returns empty rows when no captures exist', async () => {
        const result = await store.findByOrganization({
          organizationId: 'non-existent-org',
          fetchLimit: 10,
        });

        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
          expect(result.value.rows).toEqual([]);
          expect(result.value.total).toBe(0);
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

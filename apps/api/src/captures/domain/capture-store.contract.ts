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
        const archived = createTestCapture({
          id: 'archived-id',
          status: 'archived',
        });

        await store.save(inbox);
        await store.save(archived);

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
  });
};

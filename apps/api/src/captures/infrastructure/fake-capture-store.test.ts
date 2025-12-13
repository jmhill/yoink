import { describe, it, expect } from 'vitest';
import { createFakeCaptureStore } from './fake-capture-store.js';
import type { Capture } from '@yoink/api-contracts';

const createTestCapture = (overrides: Partial<Capture> = {}): Capture => ({
  id: `capture-${Math.random().toString(36).slice(2)}`,
  organizationId: 'org-123',
  createdById: 'user-456',
  content: 'Test content',
  status: 'inbox',
  capturedAt: '2025-01-15T10:00:00.000Z',
  ...overrides,
});

describe('createFakeCaptureStore', () => {
  describe('save', () => {
    it('returns Ok and stores capture', async () => {
      const store = createFakeCaptureStore();
      const capture = createTestCapture();

      const result = await store.save(capture);

      expect(result.isOk()).toBe(true);
      expect(store.getCaptures()).toHaveLength(1);
      expect(store.getCaptures()[0]).toEqual(capture);
    });

    it('returns Err when configured to fail', async () => {
      const store = createFakeCaptureStore({ shouldFailOnSave: true });
      const capture = createTestCapture();

      const result = await store.save(capture);

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.type).toBe('STORAGE_ERROR');
        expect(result.error.message).toBe('Save failed');
      }
      expect(store.getCaptures()).toHaveLength(0);
    });
  });

  describe('findByOrganization', () => {
    it('returns Ok with captures for organization', async () => {
      const store = createFakeCaptureStore();
      const capture = createTestCapture({ organizationId: 'org-123' });
      await store.save(capture);

      const result = await store.findByOrganization({ organizationId: 'org-123' });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.captures).toHaveLength(1);
        expect(result.value.captures[0]).toEqual(capture);
      }
    });

    it('filters by organization', async () => {
      const store = createFakeCaptureStore();
      await store.save(createTestCapture({ organizationId: 'org-1', content: 'Org 1' }));
      await store.save(createTestCapture({ organizationId: 'org-2', content: 'Org 2' }));

      const result = await store.findByOrganization({ organizationId: 'org-1' });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.captures).toHaveLength(1);
        expect(result.value.captures[0].content).toBe('Org 1');
      }
    });

    it('filters by status', async () => {
      const store = createFakeCaptureStore();
      await store.save(createTestCapture({ id: 'inbox-1', status: 'inbox' }));
      await store.save(createTestCapture({ id: 'archived-1', status: 'archived' }));

      const result = await store.findByOrganization({
        organizationId: 'org-123',
        status: 'inbox',
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.captures).toHaveLength(1);
        expect(result.value.captures[0].status).toBe('inbox');
      }
    });

    it('returns Err when configured to fail', async () => {
      const store = createFakeCaptureStore({ shouldFailOnFind: true });

      const result = await store.findByOrganization({ organizationId: 'org-123' });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.type).toBe('STORAGE_ERROR');
        expect(result.error.message).toBe('Find failed');
      }
    });
  });
});

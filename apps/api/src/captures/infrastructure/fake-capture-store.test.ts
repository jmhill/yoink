import { describe, it, expect } from 'vitest';
import { createFakeCaptureStore } from './fake-capture-store.js';
import { runCaptureStoreContractTests } from '../domain/capture-store.contract.js';

describe('FakeCaptureStore', () => {
  runCaptureStoreContractTests({
    createStore: () => createFakeCaptureStore(),
  });

  describe('test-specific behavior', () => {
    it('returns Err on save when configured to fail', async () => {
      const store = createFakeCaptureStore({ shouldFailOnSave: true });

      const result = await store.save({
        id: 'capture-1',
        organizationId: 'org-123',
        createdById: 'user-456',
        content: 'Test',
        status: 'inbox',
        capturedAt: '2025-01-15T10:00:00.000Z',
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.type).toBe('STORAGE_ERROR');
        expect(result.error.message).toBe('Save failed');
      }
    });

    it('returns Err on find when configured to fail', async () => {
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

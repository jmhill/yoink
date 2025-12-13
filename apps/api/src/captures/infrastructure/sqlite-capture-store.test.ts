import { describe, it, expect, beforeEach } from 'vitest';
import { createSqliteCaptureStore } from './sqlite-capture-store.js';
import type { Capture } from '@yoink/api-contracts';
import type { CaptureStore } from '../domain/capture-store.js';

const createTestCapture = (overrides: Partial<Capture> = {}): Capture => ({
  id: `capture-${Math.random().toString(36).slice(2)}`,
  organizationId: 'org-123',
  createdById: 'user-456',
  content: 'Test content',
  status: 'inbox',
  capturedAt: '2025-01-15T10:00:00.000Z',
  ...overrides,
});

describe('createSqliteCaptureStore', () => {
  let store: CaptureStore;

  beforeEach(() => {
    store = createSqliteCaptureStore({ location: ':memory:' });
  });

  describe('save', () => {
    it('persists a capture', async () => {
      const capture = createTestCapture({ content: 'Test content' });

      await store.save(capture);

      const result = await store.findByOrganization({
        organizationId: capture.organizationId,
      });
      expect(result.captures).toHaveLength(1);
      expect(result.captures[0]).toEqual(capture);
    });

    it('persists capture with optional fields', async () => {
      const capture = createTestCapture({
        title: 'A title',
        sourceUrl: 'https://example.com',
        sourceApp: 'browser-extension',
      });

      await store.save(capture);

      const result = await store.findByOrganization({
        organizationId: capture.organizationId,
      });
      expect(result.captures[0].title).toBe('A title');
      expect(result.captures[0].sourceUrl).toBe('https://example.com');
      expect(result.captures[0].sourceApp).toBe('browser-extension');
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

      expect(result.captures).toHaveLength(1);
      expect(result.captures[0].content).toBe('Org 1');
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

      expect(result.captures[0].content).toBe('Newer');
      expect(result.captures[1].content).toBe('Older');
    });

    it('filters by status', async () => {
      const inbox = createTestCapture({ id: 'inbox-id', status: 'inbox' });
      const archived = createTestCapture({ id: 'archived-id', status: 'archived' });

      await store.save(inbox);
      await store.save(archived);

      const result = await store.findByOrganization({
        organizationId: inbox.organizationId,
        status: 'inbox',
      });

      expect(result.captures).toHaveLength(1);
      expect(result.captures[0].status).toBe('inbox');
    });

    it('limits results', async () => {
      for (let i = 0; i < 5; i++) {
        await store.save(createTestCapture({ id: `capture-${i}` }));
      }

      const result = await store.findByOrganization({
        organizationId: 'org-123',
        limit: 2,
      });

      expect(result.captures).toHaveLength(2);
    });

    it('returns empty array when no captures exist', async () => {
      const result = await store.findByOrganization({
        organizationId: 'non-existent-org',
      });

      expect(result.captures).toEqual([]);
    });
  });
});

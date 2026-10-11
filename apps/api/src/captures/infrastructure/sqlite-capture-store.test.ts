import { describe, beforeAll, afterAll, beforeEach, it, expect } from 'vitest';
import { createFakeClock } from '@yoink/infrastructure';
import { createSqliteCaptureStore } from './sqlite-capture-store.js';
import { createTestDatabase, type Database } from '../../database/test-utils.js';
import { runCaptureStoreContractTests } from '../domain/capture-store.contract.js';

describe('SqliteCaptureStore', () => {
  let db: Database;
  const clock = createFakeClock(new Date('2024-12-24T10:00:00.000Z'));

  beforeAll(async () => {
    db = await createTestDatabase();
  });

  afterAll(async () => {
    await db.close();
  });

  runCaptureStoreContractTests({
    createStore: () => createSqliteCaptureStore(db, clock),
    beforeEach: async () => {
      // Clear data between tests (respecting foreign key order)
      await db.execute({ sql: 'DELETE FROM captures' });
    },
  });

  describe('invalid rows', () => {
    const now = '2024-12-24T10:00:00.000Z';

    beforeEach(async () => {
      await db.execute({ sql: 'DELETE FROM captures' });
      await db.execute({
        sql: `INSERT OR IGNORE INTO organizations (id, name, created_at) VALUES (?, ?, ?)`,
        args: ['org-bad', 'Bad org', now],
      });
      await db.execute({
        sql: `INSERT OR IGNORE INTO users (id, email, created_at) VALUES (?, ?, ?)`,
        args: ['user-bad', 'bad@example.com', now],
      });
      await db.execute({
        sql: `
          INSERT INTO captures (
            id, organization_id, created_by_id, content, status, captured_at
          ) VALUES (?, ?, ?, ?, 'bogus', ?)
        `,
        args: [
          'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          'org-bad',
          'user-bad',
          'Broken row',
          now,
        ],
      });
    });

    it('returns a storage error for a row with a bad status', async () => {
      const store = await createSqliteCaptureStore(db, clock);
      const found = await store.findById('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
      expect(found.isErr()).toBe(true);
      if (found.isErr()) {
        expect(found.error.type).toBe('STORAGE_ERROR');
      }
    });

    it('fails the whole list page when a row has a bad status', async () => {
      const store = await createSqliteCaptureStore(db, clock);
      const listed = await store.findByOrganization({
        organizationId: 'org-bad',
        fetchLimit: 50,
      });
      expect(listed.isErr()).toBe(true);
      if (listed.isErr()) {
        expect(listed.error.type).toBe('STORAGE_ERROR');
      }
    });
  });
});

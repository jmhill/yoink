import { describe, beforeAll, afterAll } from 'vitest';
import { createSqliteListStore } from './sqlite-list-store.js';
import { createTestDatabase, type Database } from '../../database/test-utils.js';
import { runListStoreContractTests } from '../domain/list-store.contract.js';

describe('SqliteListStore', () => {
  let db: Database;

  beforeAll(async () => {
    db = await createTestDatabase();
  });

  afterAll(async () => {
    await db.close();
  });

  runListStoreContractTests({
    createStore: () => createSqliteListStore(db),
    beforeEach: async () => {
      await db.execute({ sql: 'DELETE FROM lists' });
      await db.execute({ sql: 'DELETE FROM users WHERE id = ?', args: ['550e8400-e29b-41d4-a716-446655440002'] });
      await db.execute({
        sql: 'DELETE FROM organizations WHERE id IN (?, ?)',
        args: [
          '550e8400-e29b-41d4-a716-446655440001',
          '550e8400-e29b-41d4-a716-446655440099',
        ],
      });
      await db.execute({
        sql: `INSERT INTO organizations (id, name, created_at) VALUES (?, ?, ?), (?, ?, ?)`,
        args: [
          '550e8400-e29b-41d4-a716-446655440001',
          'Org 1',
          '2025-01-15T10:00:00.000Z',
          '550e8400-e29b-41d4-a716-446655440099',
          'Org 2',
          '2025-01-15T10:00:00.000Z',
        ],
      });
      await db.execute({
        sql: `INSERT INTO users (id, email, created_at) VALUES (?, ?, ?)`,
        args: [
          '550e8400-e29b-41d4-a716-446655440002',
          'lister@example.com',
          '2025-01-15T10:00:00.000Z',
        ],
      });
    },
  });
});

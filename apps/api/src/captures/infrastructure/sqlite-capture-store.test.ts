import { describe, beforeAll, afterAll } from 'vitest';
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
});

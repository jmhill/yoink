import { describe, beforeAll, afterAll } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { createFakeClock } from '@yoink/infrastructure';
import { createSqliteCaptureStore } from './sqlite-capture-store.js';
import { runMigrations } from '../../database/migrator.js';
import { migrations } from '../../database/migrations.js';
import { runCaptureStoreContractTests } from '../domain/capture-store.contract.js';

describe('SqliteCaptureStore', () => {
  let db: DatabaseSync;
  const clock = createFakeClock(new Date('2024-12-24T10:00:00.000Z'));

  beforeAll(() => {
    db = new DatabaseSync(':memory:');
    runMigrations(db, migrations);
  });

  afterAll(() => {
    db.close();
  });

  runCaptureStoreContractTests({
    createStore: () => createSqliteCaptureStore(db, clock),
    beforeEach: () => {
      // Clear data between tests (respecting foreign key order)
      db.exec('DELETE FROM captures');
    },
  });
});

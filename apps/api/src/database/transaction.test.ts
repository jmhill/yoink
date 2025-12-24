import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { okAsync, errAsync } from 'neverthrow';
import { withTransaction } from './transaction.js';

describe('withTransaction', () => {
  let db: DatabaseSync;

  beforeEach(() => {
    db = new DatabaseSync(':memory:');
    db.exec(`
      CREATE TABLE test_items (
        id TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    `);
  });

  afterEach(() => {
    db.close();
  });

  it('commits transaction when operation succeeds', async () => {
    const result = await withTransaction(db, () => {
      db.prepare('INSERT INTO test_items (id, value) VALUES (?, ?)').run('1', 'test');
      return okAsync({ id: '1', value: 'test' });
    });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual({ id: '1', value: 'test' });

    // Verify data was committed
    const row = db.prepare('SELECT * FROM test_items WHERE id = ?').get('1');
    expect(row).toEqual({ id: '1', value: 'test' });
  });

  it('rolls back transaction when operation returns error', async () => {
    const testError = { type: 'TEST_ERROR' as const, message: 'Test error' };

    const result = await withTransaction(db, () => {
      db.prepare('INSERT INTO test_items (id, value) VALUES (?, ?)').run('1', 'test');
      return errAsync(testError);
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toEqual(testError);

    // Verify data was rolled back
    const row = db.prepare('SELECT * FROM test_items WHERE id = ?').get('1');
    expect(row).toBeUndefined();
  });

  it('rolls back transaction when operation throws', () => {
    expect(() =>
      withTransaction(db, () => {
        db.prepare('INSERT INTO test_items (id, value) VALUES (?, ?)').run('1', 'test');
        throw new Error('Unexpected error');
      })
    ).toThrow('Unexpected error');

    // Verify data was rolled back
    const row = db.prepare('SELECT * FROM test_items WHERE id = ?').get('1');
    expect(row).toBeUndefined();
  });

  it('supports multiple operations in a single transaction', async () => {
    const result = await withTransaction(db, () => {
      db.prepare('INSERT INTO test_items (id, value) VALUES (?, ?)').run('1', 'first');
      db.prepare('INSERT INTO test_items (id, value) VALUES (?, ?)').run('2', 'second');
      return okAsync({ count: 2 });
    });

    expect(result.isOk()).toBe(true);

    // Verify both items were committed
    const rows = db.prepare('SELECT * FROM test_items ORDER BY id').all();
    expect(rows).toEqual([
      { id: '1', value: 'first' },
      { id: '2', value: 'second' },
    ]);
  });

  it('rolls back all operations when later operation fails', async () => {
    const testError = { type: 'SECOND_FAILED' as const };

    const result = await withTransaction(db, () => {
      db.prepare('INSERT INTO test_items (id, value) VALUES (?, ?)').run('1', 'first');
      db.prepare('INSERT INTO test_items (id, value) VALUES (?, ?)').run('2', 'second');
      return errAsync(testError);
    });

    expect(result.isErr()).toBe(true);

    // Verify both items were rolled back
    const rows = db.prepare('SELECT * FROM test_items').all();
    expect(rows).toEqual([]);
  });

  it('supports chained ResultAsync operations', async () => {
    const result = await withTransaction(db, () => {
      return okAsync(undefined)
        .andThen(() => {
          db.prepare('INSERT INTO test_items (id, value) VALUES (?, ?)').run('1', 'first');
          return okAsync(undefined);
        })
        .andThen(() => {
          db.prepare('INSERT INTO test_items (id, value) VALUES (?, ?)').run('2', 'second');
          return okAsync({ inserted: 2 });
        });
    });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual({ inserted: 2 });

    const rows = db.prepare('SELECT * FROM test_items ORDER BY id').all();
    expect(rows).toHaveLength(2);
  });

  it('rolls back chained operations when middle operation fails', async () => {
    const testError = { type: 'MIDDLE_FAILED' as const };

    const result = await withTransaction(db, () => {
      return okAsync(undefined)
        .andThen(() => {
          db.prepare('INSERT INTO test_items (id, value) VALUES (?, ?)').run('1', 'first');
          return okAsync(undefined);
        })
        .andThen(() => {
          return errAsync(testError);
        })
        .andThen(() => {
          // This should not execute
          db.prepare('INSERT INTO test_items (id, value) VALUES (?, ?)').run('2', 'second');
          return okAsync({ inserted: 2 });
        });
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toEqual(testError);

    // First insert should be rolled back
    const rows = db.prepare('SELECT * FROM test_items').all();
    expect(rows).toEqual([]);
  });
});

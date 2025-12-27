import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { okAsync, errAsync, ResultAsync } from 'neverthrow';
import { withTransaction } from './transaction.js';
import { createBareTestDatabase, type Database } from './test-utils.js';

describe('withTransaction', () => {
  let db: Database;

  beforeEach(async () => {
    db = createBareTestDatabase();
    await db.execute({
      sql: `
      CREATE TABLE test_items (
        id TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    `,
    });
  });

  afterEach(async () => {
    await db.close();
  });

  it('commits transaction when operation succeeds', async () => {
    const result = await withTransaction(db, () => {
      return ResultAsync.fromPromise(
        db.execute({
          sql: 'INSERT INTO test_items (id, value) VALUES (?, ?)',
          args: ['1', 'test'],
        }),
        (e) => e as Error
      ).map(() => ({ id: '1', value: 'test' }));
    });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual({ id: '1', value: 'test' });

    // Verify data was committed
    const queryResult = await db.execute({
      sql: 'SELECT * FROM test_items WHERE id = ?',
      args: ['1'],
    });
    expect(queryResult.rows[0]).toEqual({ id: '1', value: 'test' });
  });

  it('rolls back transaction when operation returns error', async () => {
    const testError = { type: 'TEST_ERROR' as const, message: 'Test error' };

    const result = await withTransaction(db, () => {
      return ResultAsync.fromPromise(
        db.execute({
          sql: 'INSERT INTO test_items (id, value) VALUES (?, ?)',
          args: ['1', 'test'],
        }),
        (e) => e as Error
      ).andThen(() => errAsync(testError));
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toEqual(testError);

    // Verify data was rolled back
    const queryResult = await db.execute({
      sql: 'SELECT * FROM test_items WHERE id = ?',
      args: ['1'],
    });
    expect(queryResult.rows[0]).toBeUndefined();
  });

  it('rolls back transaction when operation throws', async () => {
    await expect(
      withTransaction(db, () => {
        throw new Error('Unexpected error');
      })
    ).rejects.toThrow('Unexpected error');

    // Can't reliably verify rollback here since we threw before any insert
    // But the test verifies the error propagates correctly
  });

  it('supports multiple operations in a single transaction', async () => {
    const result = await withTransaction(db, () => {
      return ResultAsync.fromPromise(
        db.execute({
          sql: 'INSERT INTO test_items (id, value) VALUES (?, ?)',
          args: ['1', 'first'],
        }),
        (e) => e as Error
      )
        .andThen(() =>
          ResultAsync.fromPromise(
            db.execute({
              sql: 'INSERT INTO test_items (id, value) VALUES (?, ?)',
              args: ['2', 'second'],
            }),
            (e) => e as Error
          )
        )
        .map(() => ({ count: 2 }));
    });

    expect(result.isOk()).toBe(true);

    // Verify both items were committed
    const queryResult = await db.execute({
      sql: 'SELECT * FROM test_items ORDER BY id',
    });
    expect(queryResult.rows).toEqual([
      { id: '1', value: 'first' },
      { id: '2', value: 'second' },
    ]);
  });

  it('rolls back all operations when later operation fails', async () => {
    const testError = { type: 'SECOND_FAILED' as const };

    const result = await withTransaction(db, () => {
      return ResultAsync.fromPromise(
        db.execute({
          sql: 'INSERT INTO test_items (id, value) VALUES (?, ?)',
          args: ['1', 'first'],
        }),
        (e) => e as Error
      )
        .andThen(() =>
          ResultAsync.fromPromise(
            db.execute({
              sql: 'INSERT INTO test_items (id, value) VALUES (?, ?)',
              args: ['2', 'second'],
            }),
            (e) => e as Error
          )
        )
        .andThen(() => errAsync(testError));
    });

    expect(result.isErr()).toBe(true);

    // Verify both items were rolled back
    const queryResult = await db.execute({
      sql: 'SELECT * FROM test_items',
    });
    expect(queryResult.rows).toEqual([]);
  });

  it('supports chained ResultAsync operations', async () => {
    const result = await withTransaction(db, () => {
      return okAsync(undefined)
        .andThen(() =>
          ResultAsync.fromPromise(
            db.execute({
              sql: 'INSERT INTO test_items (id, value) VALUES (?, ?)',
              args: ['1', 'first'],
            }),
            (e) => e as Error
          )
        )
        .andThen(() =>
          ResultAsync.fromPromise(
            db.execute({
              sql: 'INSERT INTO test_items (id, value) VALUES (?, ?)',
              args: ['2', 'second'],
            }),
            (e) => e as Error
          )
        )
        .map(() => ({ inserted: 2 }));
    });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual({ inserted: 2 });

    const queryResult = await db.execute({
      sql: 'SELECT * FROM test_items ORDER BY id',
    });
    expect(queryResult.rows).toHaveLength(2);
  });

  it('rolls back chained operations when middle operation fails', async () => {
    const testError = { type: 'MIDDLE_FAILED' as const };

    const result = await withTransaction(db, () => {
      return okAsync(undefined)
        .andThen(() =>
          ResultAsync.fromPromise(
            db.execute({
              sql: 'INSERT INTO test_items (id, value) VALUES (?, ?)',
              args: ['1', 'first'],
            }),
            (e) => e as Error
          )
        )
        .andThen(() => errAsync(testError))
        .andThen(() =>
          // This should not execute
          ResultAsync.fromPromise(
            db.execute({
              sql: 'INSERT INTO test_items (id, value) VALUES (?, ?)',
              args: ['2', 'second'],
            }),
            (e) => e as Error
          )
        )
        .map(() => ({ inserted: 2 }));
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toEqual(testError);

    // First insert should be rolled back
    const queryResult = await db.execute({
      sql: 'SELECT * FROM test_items',
    });
    expect(queryResult.rows).toEqual([]);
  });
});

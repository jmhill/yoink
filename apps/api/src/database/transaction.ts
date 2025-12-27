import type { Database } from './types.js';
import { ResultAsync } from 'neverthrow';

/**
 * Wraps a function that returns a ResultAsync in a database transaction.
 *
 * - Begins a transaction before executing the function
 * - Commits if the ResultAsync resolves to Ok
 * - Rolls back if the ResultAsync resolves to Err
 * - Rolls back and rethrows if the function throws synchronously
 *
 * @example
 * ```typescript
 * const result = await withTransaction(db, () => {
 *   return taskStore.save(task).andThen(() => {
 *     return captureStore.markAsProcessed({ ... });
 *   });
 * });
 * ```
 */
export const withTransaction = async <T, E>(
  db: Database,
  fn: () => ResultAsync<T, E>
): Promise<ResultAsync<T, E>> => {
  await db.execute({ sql: 'BEGIN TRANSACTION' });

  let result: ResultAsync<T, E>;
  try {
    result = fn();
  } catch (error) {
    await db.execute({ sql: 'ROLLBACK' });
    throw error;
  }

  return result
    .map(async (value) => {
      await db.execute({ sql: 'COMMIT' });
      return value;
    })
    .mapErr(async (error) => {
      await db.execute({ sql: 'ROLLBACK' });
      return error;
    });
};

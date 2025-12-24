import type { DatabaseSync } from 'node:sqlite';
import type { ResultAsync } from 'neverthrow';

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
export const withTransaction = <T, E>(
  db: DatabaseSync,
  fn: () => ResultAsync<T, E>
): ResultAsync<T, E> => {
  db.exec('BEGIN TRANSACTION');

  let result: ResultAsync<T, E>;
  try {
    result = fn();
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }

  return result
    .map((value) => {
      db.exec('COMMIT');
      return value;
    })
    .mapErr((error) => {
      db.exec('ROLLBACK');
      return error;
    });
};

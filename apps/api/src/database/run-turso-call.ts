import { err, ok, type Result } from 'neverthrow';
import { classifyTursoFailure } from './classify-turso-failure.js';

/** One stalled Turso call on the request path should not sit past the window seen on Oct 26. */
export const TURSO_CALL_TIMEOUT_MS = 5_000;

/**
 * Migrations copy tables and backfill rows in one batch. Fly's release command
 * runs those through createDatabase, so they need longer than a request.
 */
export const TURSO_MIGRATION_TIMEOUT_MS = 120_000;

export const tursoCallTimeout = (timeoutMs: number) => ({
  name: 'TursoCallTimeoutError' as const,
  code: 'TURSO_CALL_TIMEOUT' as const,
  message: `Turso call timed out after ${timeoutMs}ms`,
  timeoutMs,
});

const runWithTimeout = <T>(
  operation: () => Promise<T>,
  timeoutMs: number
): Promise<Result<T, unknown>> =>
  new Promise((resolve) => {
    const timer = setTimeout(() => {
      resolve(err(tursoCallTimeout(timeoutMs)));
    }, timeoutMs);

    operation().then(
      (value) => {
        clearTimeout(timer);
        resolve(ok(value));
      },
      (error: unknown) => {
        clearTimeout(timer);
        resolve(err(error));
      }
    );
  });

/**
 * Run one Turso call. Every call times out.
 * A read may be tried once more after a connection failure. A write is not:
 * the first request may already have committed.
 */
export const runTursoCall = async <T>(
  operation: () => Promise<T>,
  options: { readonly timeoutMs: number; readonly retry: boolean }
): Promise<Result<T, unknown>> => {
  const first = await runWithTimeout(operation, options.timeoutMs);
  if (first.isOk() || !options.retry) {
    return first;
  }
  if (classifyTursoFailure(first.error) !== 'connection') {
    return first;
  }
  return runWithTimeout(operation, options.timeoutMs);
};

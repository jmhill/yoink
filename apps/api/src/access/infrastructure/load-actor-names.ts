import { okAsync, ResultAsync } from 'neverthrow';
import { z } from 'zod';
import type { Database } from '../../platform/database/types.js';

const actorNameRowSchema = z.object({
  id: z.string(),
  name: z.string().nullable(),
  email: z.string(),
});

export type ActorNameFact = {
  readonly id: string;
  readonly name: string;
};

export type ActorNameError = {
  readonly message: string;
  readonly cause?: unknown;
};

const placeholders = (count: number): string =>
  Array.from({ length: count }, () => '?').join(', ');

/**
 * Display name for a timeline actor: the stored name, including an empty
 * one, otherwise the email. Access owns `users`.
 */
export const loadActorNamesFromSqlite =
  (db: Database) =>
  (ids: readonly string[]): ResultAsync<readonly ActorNameFact[], ActorNameError> => {
    if (ids.length === 0) {
      return okAsync([]);
    }
    return ResultAsync.fromPromise(
      db.execute({
        sql: `SELECT id, name, email FROM users WHERE id IN (${placeholders(ids.length)})`,
        args: [...ids],
      }),
      (cause) => ({ message: 'Failed to load actor names', cause })
    ).map((result) =>
      result.rows.flatMap((raw) => {
        const parsed = actorNameRowSchema.safeParse(raw);
        if (!parsed.success) {
          return [];
        }
        return [{ id: parsed.data.id, name: parsed.data.name ?? parsed.data.email }];
      })
    );
  };

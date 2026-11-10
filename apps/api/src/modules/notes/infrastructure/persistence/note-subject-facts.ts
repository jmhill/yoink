import { okAsync, ResultAsync } from 'neverthrow';
import { z } from 'zod';
import type { Database } from '../../../../platform/database/types.js';

const noteSubjectRowSchema = z.object({
  id: z.string(),
  title: z.string(),
  deleted_at: z.string().nullable(),
});

export type NoteSubjectFact = {
  readonly id: string;
  readonly title: string;
  readonly deleted: boolean;
};

export type NoteSubjectFactError = {
  readonly message: string;
  readonly cause?: unknown;
};

const placeholders = (count: number): string =>
  Array.from({ length: count }, () => '?').join(', ');

/** Note id, title, and whether the row is soft-deleted. Includes deleted notes. */
export const loadNoteSubjectFacts =
  (db: Database) =>
  (ids: readonly string[]): ResultAsync<readonly NoteSubjectFact[], NoteSubjectFactError> => {
    if (ids.length === 0) {
      return okAsync([]);
    }
    return ResultAsync.fromPromise(
      db.execute({
        sql: `SELECT id, title, deleted_at FROM project_notes WHERE id IN (${placeholders(ids.length)})`,
        args: [...ids],
      }),
      (cause) => ({ message: 'Failed to load note subjects', cause })
    ).map((result) =>
      result.rows.flatMap((raw) => {
        const parsed = noteSubjectRowSchema.safeParse(raw);
        if (!parsed.success) {
          return [];
        }
        return [
          {
            id: parsed.data.id,
            title: parsed.data.title,
            deleted: parsed.data.deleted_at !== null,
          },
        ];
      })
    );
  };

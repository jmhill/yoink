import { okAsync, ResultAsync } from 'neverthrow';
import { z } from 'zod';
import type { Database } from '../../../../platform/database/types.js';

const taskSubjectRowSchema = z.object({
  id: z.string(),
  title: z.string(),
  deleted_at: z.string().nullable(),
});

const projectNameRowSchema = z.object({
  id: z.string(),
  name: z.string(),
});

export type TaskSubjectFact = {
  readonly id: string;
  readonly title: string;
  readonly deleted: boolean;
};

export type ProjectNameFact = {
  readonly id: string;
  readonly name: string;
};

export type SubjectFactError = {
  readonly message: string;
  readonly cause?: unknown;
};

const placeholders = (count: number): string =>
  Array.from({ length: count }, () => '?').join(', ');

/** Task id, title, and whether the row is soft-deleted. Includes deleted tasks. */
export const loadTaskSubjectFacts =
  (db: Database) =>
  (ids: readonly string[]): ResultAsync<readonly TaskSubjectFact[], SubjectFactError> => {
    if (ids.length === 0) {
      return okAsync([]);
    }
    return ResultAsync.fromPromise(
      db.execute({
        sql: `SELECT id, title, deleted_at FROM tasks WHERE id IN (${placeholders(ids.length)})`,
        args: [...ids],
      }),
      (cause) => ({ message: 'Failed to load task subjects', cause })
    ).map((result) =>
      result.rows.flatMap((raw) => {
        const parsed = taskSubjectRowSchema.safeParse(raw);
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

/** Project id and name. Task Management owns `projects`. */
export const loadProjectNameFacts =
  (db: Database) =>
  (ids: readonly string[]): ResultAsync<readonly ProjectNameFact[], SubjectFactError> => {
    if (ids.length === 0) {
      return okAsync([]);
    }
    return ResultAsync.fromPromise(
      db.execute({
        sql: `SELECT id, name FROM projects WHERE id IN (${placeholders(ids.length)})`,
        args: [...ids],
      }),
      (cause) => ({ message: 'Failed to load project names', cause })
    ).map((result) =>
      result.rows.flatMap((raw) => {
        const parsed = projectNameRowSchema.safeParse(raw);
        if (!parsed.success) {
          return [];
        }
        return [{ id: parsed.data.id, name: parsed.data.name }];
      })
    );
  };

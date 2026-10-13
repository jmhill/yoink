import { okAsync, ResultAsync } from 'neverthrow';
import { z } from 'zod';
import type { Database } from '../../database/types.js';
import { storageError } from '../../projects/domain/project-errors.js';
import {
  UNKNOWN_ACTOR_NAME,
  type TimelineLookups,
} from '../../shared/change-log/domain/to-timeline-entry.js';
import type { LoadTimelineLookups } from '../application/ports.js';

const taskLookupRowSchema = z.object({
  id: z.string(),
  title: z.string(),
  deleted_at: z.string().nullable(),
});

const userLookupRowSchema = z.object({
  id: z.string(),
  name: z.string().nullable(),
  email: z.string(),
});

const projectLookupRowSchema = z.object({
  id: z.string(),
  name: z.string(),
});

const noteLookupRowSchema = z.object({
  id: z.string(),
  title: z.string(),
  deleted_at: z.string().nullable(),
});

const placeholders = (count: number): string =>
  Array.from({ length: count }, () => '?').join(', ');

const actorNameFromUser = (row: z.infer<typeof userLookupRowSchema>): string =>
  row.name ?? row.email;

export const createSqliteTimelineLookups = (db: Database): LoadTimelineLookups => {
  return (ids) => {
    const queries = [
      ids.taskIds.length > 0
        ? {
            sql: `SELECT id, title, deleted_at FROM tasks WHERE id IN (${placeholders(ids.taskIds.length)})`,
            args: [...ids.taskIds],
          }
        : null,
      ids.userIds.length > 0
        ? {
            sql: `SELECT id, name, email FROM users WHERE id IN (${placeholders(ids.userIds.length)})`,
            args: [...ids.userIds],
          }
        : null,
      ids.projectIds.length > 0
        ? {
            sql: `SELECT id, name FROM projects WHERE id IN (${placeholders(ids.projectIds.length)})`,
            args: [...ids.projectIds],
          }
        : null,
      ids.noteIds.length > 0
        ? {
            sql: `SELECT id, title, deleted_at FROM project_notes WHERE id IN (${placeholders(ids.noteIds.length)})`,
            args: [...ids.noteIds],
          }
        : null,
    ].filter((query): query is { sql: string; args: string[] } => query !== null);

    if (queries.length === 0) {
      return okAsync({
        subjectOf: () => ({ title: null, deleted: false }),
        taskTitleOf: () => null,
        actorNameOf: () => UNKNOWN_ACTOR_NAME,
      });
    }

    return ResultAsync.fromPromise(
      db.batch(queries, 'read'),
      (cause) => storageError('Failed to load history lookups', cause)
    ).map((results) => {
      const taskTitles = new Map<string, { title: string; deleted: boolean }>();
      const actorNames = new Map<string, string>();
      const projectTitles = new Map<string, string>();
      const noteTitles = new Map<string, { title: string; deleted: boolean }>();

      let resultIndex = 0;
      if (ids.taskIds.length > 0) {
        for (const raw of results[resultIndex]?.rows ?? []) {
          const parsed = taskLookupRowSchema.safeParse(raw);
          if (parsed.success) {
            taskTitles.set(parsed.data.id, {
              title: parsed.data.title,
              deleted: parsed.data.deleted_at !== null,
            });
          }
        }
        resultIndex += 1;
      }
      if (ids.userIds.length > 0) {
        for (const raw of results[resultIndex]?.rows ?? []) {
          const parsed = userLookupRowSchema.safeParse(raw);
          if (parsed.success) {
            actorNames.set(parsed.data.id, actorNameFromUser(parsed.data));
          }
        }
        resultIndex += 1;
      }
      if (ids.projectIds.length > 0) {
        for (const raw of results[resultIndex]?.rows ?? []) {
          const parsed = projectLookupRowSchema.safeParse(raw);
          if (parsed.success) {
            projectTitles.set(parsed.data.id, parsed.data.name);
          }
        }
        resultIndex += 1;
      }
      if (ids.noteIds.length > 0) {
        for (const raw of results[resultIndex]?.rows ?? []) {
          const parsed = noteLookupRowSchema.safeParse(raw);
          if (parsed.success) {
            noteTitles.set(parsed.data.id, {
              title: parsed.data.title,
              deleted: parsed.data.deleted_at !== null,
            });
          }
        }
      }

      const lookups: TimelineLookups = {
        subjectOf: (type, id) => {
          if (type === 'task') {
            const found = taskTitles.get(id);
            return found
              ? { title: found.title, deleted: found.deleted }
              : { title: null, deleted: false };
          }
          if (type === 'note') {
            const found = noteTitles.get(id);
            return found
              ? { title: found.title, deleted: found.deleted }
              : { title: null, deleted: false };
          }
          const name = projectTitles.get(id);
          return { title: name ?? null, deleted: false };
        },
        taskTitleOf: (id) => taskTitles.get(id)?.title ?? null,
        actorNameOf: (userId) =>
          userId ? (actorNames.get(userId) ?? UNKNOWN_ACTOR_NAME) : UNKNOWN_ACTOR_NAME,
      };
      return lookups;
    });
  };
};

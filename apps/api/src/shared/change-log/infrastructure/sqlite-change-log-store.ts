import { errAsync, okAsync, ResultAsync } from 'neverthrow';
import { z } from 'zod';
import type { Database } from '../../../database/types.js';
import { parseChangeLogRecord } from '../domain/parse-record.js';
import type { ChangeLogParseError, ChangeLogRecord } from '../domain/record.js';
import type { ChangeLogSubjectType } from '../domain/kinds.js';

export type ChangeLogStorageError = {
  readonly type: 'STORAGE_ERROR';
  readonly message: string;
  readonly cause?: unknown;
};

export type ListChangeLogError = ChangeLogStorageError | ChangeLogParseError;

const storageError = (message: string, cause?: unknown): ChangeLogStorageError => ({
  type: 'STORAGE_ERROR',
  message,
  cause,
});

const changeLogRowSchema = z.object({
  id: z.string(),
  organization_id: z.string(),
  project_id: z.string().nullable(),
  subject_type: z.string(),
  subject_id: z.string(),
  kind: z.string(),
  schema_version: z.coerce.number(),
  payload_json: z.string(),
  actor_user_id: z.string().nullable(),
  actor_kind: z.string().nullable(),
  occurred_at: z.string(),
  hidden: z.coerce.number(),
});

const rowToUnknown = (raw: unknown): unknown => {
  const row = changeLogRowSchema.safeParse(raw);
  if (!row.success) {
    return raw;
  }

  let payload: unknown;
  try {
    payload = JSON.parse(row.data.payload_json);
  } catch {
    return { ...row.data, payload_json: undefined };
  }

  return {
    id: row.data.id,
    organizationId: row.data.organization_id,
    projectId: row.data.project_id,
    subjectType: row.data.subject_type,
    subjectId: row.data.subject_id,
    kind: row.data.kind,
    schemaVersion: row.data.schema_version,
    payload,
    actorUserId: row.data.actor_user_id,
    actorKind: row.data.actor_kind,
    occurredAt: row.data.occurred_at,
    hidden: row.data.hidden === 1,
  };
};

export type ChangeLogStore = {
  findBySubject: (
    subjectType: ChangeLogSubjectType,
    subjectId: string
  ) => ResultAsync<ChangeLogRecord[], ListChangeLogError>;
};

export const createSqliteChangeLogStore = (db: Database): ChangeLogStore => ({
  findBySubject: (subjectType, subjectId) =>
    ResultAsync.fromPromise(
      db.execute({
        sql: `
          SELECT
            id, organization_id, project_id, subject_type, subject_id,
            kind, schema_version, payload_json, actor_user_id, actor_kind,
            occurred_at, hidden
          FROM change_log
          WHERE subject_type = ? AND subject_id = ?
          ORDER BY occurred_at ASC, id ASC
        `,
        args: [subjectType, subjectId],
      }),
      (cause) => storageError('Failed to load change log', cause)
    ).andThen((result) => {
      const records: ChangeLogRecord[] = [];
      for (const raw of result.rows) {
        const parsed = parseChangeLogRecord(rowToUnknown(raw));
        if (parsed.isErr()) {
          return errAsync(parsed.error);
        }
        records.push(parsed.value);
      }
      return okAsync(records);
    }),
});

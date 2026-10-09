import { errAsync, okAsync, ResultAsync } from 'neverthrow';
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

type ChangeLogRow = {
  id: string;
  organization_id: string;
  project_id: string | null;
  subject_type: string;
  subject_id: string;
  kind: string;
  schema_version: number;
  payload_json: string;
  actor_user_id: string | null;
  actor_kind: string | null;
  occurred_at: string;
  hidden: number;
};

const rowToUnknown = (row: ChangeLogRow): unknown => {
  let payload: unknown = {};
  try {
    payload = JSON.parse(row.payload_json) as unknown;
  } catch {
    payload = row.payload_json;
  }

  return {
    id: row.id,
    organizationId: row.organization_id,
    projectId: row.project_id,
    subjectType: row.subject_type,
    subjectId: row.subject_id,
    kind: row.kind,
    schemaVersion: Number(row.schema_version),
    payload,
    actorUserId: row.actor_user_id,
    actorKind: row.actor_kind,
    occurredAt: row.occurred_at,
    hidden: row.hidden === 1,
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
        const parsed = parseChangeLogRecord(rowToUnknown(raw as ChangeLogRow));
        if (parsed.isErr()) {
          return errAsync(parsed.error);
        }
        records.push(parsed.value);
      }
      return okAsync(records);
    }),
});

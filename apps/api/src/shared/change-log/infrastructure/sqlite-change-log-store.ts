import { err, errAsync, ok, okAsync, ResultAsync, type Result } from 'neverthrow';
import { z } from 'zod';
import type { Database } from '../../../database/types.js';
import { parseChangeLogRecord } from '../domain/parse-record.js';
import type { ChangeLogParseError, ChangeLogRecord } from '../domain/record.js';
import type { ChangeLogSubjectType } from '../domain/kinds.js';
import type {
  ChangeLogStorageError,
  HistoryPageItem,
} from '../domain/history-page-item.js';
import { PROJECT_TIMELINE_SQL, VISIBLE_TIMELINE_SQL } from './sql.js';
import type { KeysetCursor } from '../../../listing/domain/keyset-cursor.js';
import type { KeysetRows } from '../../../listing/domain/listed-page.js';
import { pageSqlite } from '../../../listing/infrastructure/page-sqlite.js';
import {
  projectHistoryDirection,
  taskHistoryDirection,
} from '../../../listing/domain/list-keys.js';

export type { ChangeLogStorageError, HistoryPageItem, UnparsedHistoryRow } from '../domain/history-page-item.js';

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
  seq: z.coerce.number().int(),
});

const readSeq = (raw: Record<string, unknown>): Result<number, ChangeLogStorageError> => {
  const value = raw.seq;
  if (typeof value === 'number' && Number.isFinite(value)) {
    return ok(value);
  }
  if (typeof value === 'string' && value.length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return ok(parsed);
    }
  }
  return err(storageError('Unreadable change-log seq', { seq: raw.seq }));
};

const readSubjectType = (
  value: string
): 'task' | 'project' | 'note' | 'list' | 'unrecognised' => {
  if (value === 'task' || value === 'project' || value === 'note' || value === 'list') {
    return value;
  }
  return 'unrecognised';
};

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

const actorKindOf = (value: string | null): 'user' | 'bot' | null =>
  value === 'user' || value === 'bot' ? value : null;

export const rowToHistoryItem = (
  raw: Record<string, unknown>
): Result<HistoryPageItem, ChangeLogStorageError> => {
  const row = changeLogRowSchema.safeParse(raw);
  const occurredAt = row.success ? row.data.occurred_at : String(raw.occurred_at ?? '');
  const seqResult = row.success ? ok(row.data.seq) : readSeq(raw);
  if (seqResult.isErr()) {
    return err(seqResult.error);
  }
  const seq = seqResult.value;
  const parsed = parseChangeLogRecord(rowToUnknown(raw));
  if (parsed.isOk()) {
    return ok({ occurredAt, seq, record: parsed.value });
  }
  const rawSubject = row.success ? row.data.subject_type : String(raw.subject_type ?? '');
  const subjectType = readSubjectType(rawSubject);
  return ok({
    occurredAt,
    seq,
    record: {
      type: 'UNPARSED',
      id: row.success ? row.data.id : String(raw.id ?? ''),
      kind: row.success ? row.data.kind : String(raw.kind ?? ''),
      occurredAt,
      actorUserId: row.success ? row.data.actor_user_id : null,
      actorKind: actorKindOf(row.success ? row.data.actor_kind : null),
      subjectType,
      subjectId: row.success ? row.data.subject_id : String(raw.subject_id ?? ''),
    },
  });
};

const mapHistoryRows = (
  page: KeysetRows<Record<string, unknown>>
): ResultAsync<KeysetRows<HistoryPageItem>, ChangeLogStorageError> => {
  const rows: HistoryPageItem[] = [];
  for (const raw of page.rows) {
    const mapped = rowToHistoryItem(raw);
    if (mapped.isErr()) {
      return errAsync(mapped.error);
    }
    rows.push(mapped.value);
  }
  return okAsync({ ...page, rows });
};

export type PageVisibleHistory = (options: {
  organizationId: string;
  fetchLimit: number;
  seek?: KeysetCursor;
  projectId?: string;
  subjectType?: ChangeLogSubjectType;
  subjectId?: string;
}) => ResultAsync<KeysetRows<HistoryPageItem>, ChangeLogStorageError>;

export type ChangeLogStore = {
  findBySubject: (
    subjectType: ChangeLogSubjectType,
    subjectId: string
  ) => ResultAsync<ChangeLogRecord[], ListChangeLogError>;
  pageVisibleForProject: (options: {
    organizationId: string;
    projectId: string;
    fetchLimit: number;
    seek?: KeysetCursor;
  }) => ResultAsync<KeysetRows<HistoryPageItem>, ChangeLogStorageError>;
  pageVisibleForTask: (options: {
    organizationId: string;
    subjectId: string;
    fetchLimit: number;
    seek?: KeysetCursor;
  }) => ResultAsync<KeysetRows<HistoryPageItem>, ChangeLogStorageError>;
};

export const createSqliteChangeLogStore = (db: Database): ChangeLogStore => ({
  pageVisibleForProject: (options) =>
    pageSqlite({
      db,
      from: 'change_log',
      whereSql: `
        organization_id = ?
          AND project_id = ?
          AND ${PROJECT_TIMELINE_SQL}
      `,
      whereArgs: [options.organizationId, options.projectId],
      orderSql: `ORDER BY occurred_at DESC, seq DESC`,
      keyColumns: ['occurred_at', 'seq'],
      direction: projectHistoryDirection,
      fetchLimit: options.fetchLimit,
      seek: options.seek,
      mapRow: (row) => row,
      errorMessage: 'Failed to load project history',
    }).andThen(mapHistoryRows),

  pageVisibleForTask: (options) =>
    pageSqlite({
      db,
      from: 'change_log',
      whereSql: `
        organization_id = ?
          AND subject_type = 'task'
          AND subject_id = ?
          AND ${VISIBLE_TIMELINE_SQL}
      `,
      whereArgs: [options.organizationId, options.subjectId],
      orderSql: `ORDER BY occurred_at DESC, seq DESC`,
      keyColumns: ['occurred_at', 'seq'],
      direction: taskHistoryDirection,
      fetchLimit: options.fetchLimit,
      seek: options.seek,
      mapRow: (row) => row,
      errorMessage: 'Failed to load task history',
    }).andThen(mapHistoryRows),

  findBySubject: (subjectType, subjectId) =>
    ResultAsync.fromPromise(
      db.execute({
        sql: `
          SELECT
            id, organization_id, project_id, subject_type, subject_id,
            kind, schema_version, payload_json, actor_user_id, actor_kind,
            occurred_at, hidden, seq
          FROM change_log
          WHERE subject_type = ? AND subject_id = ?
          ORDER BY seq ASC, occurred_at ASC, id ASC
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

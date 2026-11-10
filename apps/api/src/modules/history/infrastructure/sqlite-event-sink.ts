import type { GuardedStatement, SqlParticipant } from '../../../kernel/unit-of-work.js';
import { changeLogRecordSchema, type ChangeLogRecord } from '../domain/record.js';

const NOT_A_PLAN: GuardedStatement = {
  verb: 'insert',
  sql: '',
  args: [],
  guard: false,
};

const recordsIn = (plan: unknown): readonly ChangeLogRecord[] | undefined => {
  const parsed = changeLogRecordSchema.array().safeParse(plan);
  return parsed.success ? parsed.data : undefined;
};

/**
 * One change_log insert. Seq is the next value in this transaction.
 * The statement names no other module's table.
 */
const insertSql = (where?: string): string => `
    INSERT INTO change_log (
      id, organization_id, project_id, subject_type, subject_id,
      kind, schema_version, payload_json, actor_user_id, actor_kind,
      occurred_at, hidden, seq
    )
    SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
           COALESCE((SELECT MAX(seq) FROM change_log), 0) + 1${where ?? ''}
  `;

const insertArgs = (record: ChangeLogRecord, extra: readonly unknown[] = []): unknown[] => [
  record.id,
  record.organizationId,
  record.projectId,
  record.subjectType,
  record.subjectId,
  record.kind,
  record.schemaVersion,
  JSON.stringify(record.payload),
  record.actorUserId,
  record.actorKind,
  record.occurredAt,
  record.hidden ? 1 : 0,
  ...extra,
];

/**
 * One change_log insert. `ifChanged` keeps the row only when the statement
 * just before it updated a row. Later rows in that group key off the first
 * id, because `changes()` only sees the immediately previous statement.
 */
export const changeLogInsert = (
  record: ChangeLogRecord,
  options?: { readonly ifChanged?: boolean }
): GuardedStatement => ({
  verb: 'insert',
  guard: false,
  sql: insertSql(options?.ifChanged ? '\n    WHERE changes() > 0' : undefined),
  args: insertArgs(record),
});

export const changeLogInsertAfter = (record: ChangeLogRecord, priorId: string): GuardedStatement => ({
  verb: 'insert',
  guard: false,
  sql: insertSql('\n    WHERE EXISTS (SELECT 1 FROM change_log WHERE id = ?)'),
  args: insertArgs(record, [priorId]),
});

export const historySqlParticipant: SqlParticipant<unknown> = {
  owner: 'history',
  compile: (plan) => {
    const records = recordsIn(plan);
    if (records === undefined) {
      return [NOT_A_PLAN];
    }
    return records.map((record) => changeLogInsert(record));
  },
};

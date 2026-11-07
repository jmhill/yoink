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
export const changeLogInsert = (record: ChangeLogRecord): GuardedStatement => ({
  verb: 'insert',
  guard: false,
  sql: `
    INSERT INTO change_log (
      id, organization_id, project_id, subject_type, subject_id,
      kind, schema_version, payload_json, actor_user_id, actor_kind,
      occurred_at, hidden, seq
    )
    SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
           COALESCE((SELECT MAX(seq) FROM change_log), 0) + 1
  `,
  args: [
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
  ],
});

export const historySqlParticipant: SqlParticipant<unknown> = {
  owner: 'history',
  compile: (plan) => {
    const records = recordsIn(plan);
    if (records === undefined) {
      return [NOT_A_PLAN];
    }
    return records.map(changeLogInsert);
  },
};

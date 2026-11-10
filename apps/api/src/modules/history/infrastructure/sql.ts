import type { ChangeLogRecord } from '../domain/record.js';

export type SqlQuery = {
  sql: string;
  args?: unknown[];
};

/**
 * Visible timeline rows: not hidden, and not a TaskUpdated that only
 * moved the task between projects (or only touched openOrder).
 *
 * Damaged JSON must still pass through so the read can render Unknown.
 * CASE short-circuits so json_type never runs on invalid JSON.
 *
 * json_type is NULL when the key is absent and 'null' when the payload
 * cleared the field — a cleared due date must still show.
 */
export const VISIBLE_TIMELINE_SQL = `
  hidden = 0
  AND subject_type IN ('task', 'project', 'note')
  AND CASE
    WHEN json_valid(payload_json) = 0 THEN 1
    WHEN kind = 'TaskUpdated'
      AND json_type(payload_json, '$.title') IS NULL
      AND json_type(payload_json, '$.dueDate') IS NULL
      AND json_type(payload_json, '$.assigneeId') IS NULL
      AND json_type(payload_json, '$.listId') IS NULL
      THEN 0
    ELSE 1
  END
`;

/** Project timeline hides task-level records written by an import. Task history keeps them. */
export const PROJECT_TIMELINE_SQL = `
  ${VISIBLE_TIMELINE_SQL}
  AND CASE
    WHEN json_valid(payload_json) = 0 THEN 1
    WHEN json_type(payload_json, '$.via') = 'text'
      AND json_extract(payload_json, '$.via') = 'import'
      THEN 0
    ELSE 1
  END
`;

const changeLogInsertSql = (where?: string): string => `
      INSERT INTO change_log (
        id, organization_id, project_id, subject_type, subject_id,
        kind, schema_version, payload_json, actor_user_id, actor_kind,
        occurred_at, hidden, seq
      )
      SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
             COALESCE((SELECT MAX(seq) FROM change_log), 0) + 1${where ?? ''}
    `;

const changeLogArgs = (record: ChangeLogRecord): unknown[] => [
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
];

/**
 * Append a change_log row. This statement names only change_log.
 * The owning module's statement in the same batch is what guarantees
 * the subject exists. A second delete then changes no row, and
 * {@link insertChangeLogIfChangedQuery} writes no second history row.
 */
export const insertChangeLogQuery = (record: ChangeLogRecord): SqlQuery => ({
  sql: changeLogInsertSql(),
  args: changeLogArgs(record),
});

/**
 * Same insert, but only when the previous statement in this batch changed
 * a row (`changes() > 0`). A 0-row update or delete writes no history.
 */
export const insertChangeLogIfChangedQuery = (record: ChangeLogRecord): SqlQuery => ({
  sql: changeLogInsertSql('\n      WHERE changes() > 0'),
  args: changeLogArgs(record),
});

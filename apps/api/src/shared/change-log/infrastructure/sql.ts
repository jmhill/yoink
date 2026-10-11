import { UNLISTED_PILE_SUBJECT_ID } from '../domain/kinds.js';
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

const existsClause = (
  record: ChangeLogRecord
): { sql: string; args: unknown[] } => {
  if (record.subjectType === 'task') {
    return {
      sql: `SELECT 1 FROM tasks WHERE id = ? AND organization_id = ? AND deleted_at IS NULL`,
      args: [record.subjectId, record.organizationId],
    };
  }
  if (record.subjectType === 'project') {
    return {
      sql: `SELECT 1 FROM projects WHERE id = ? AND organization_id = ?`,
      args: [record.subjectId, record.organizationId],
    };
  }
  if (record.subjectId === UNLISTED_PILE_SUBJECT_ID) {
    return {
      sql: `SELECT 1 FROM organizations WHERE id = ?`,
      args: [record.organizationId],
    };
  }
  return {
    sql: `SELECT 1 FROM lists WHERE id = ? AND organization_id = ?`,
    args: [record.subjectId, record.organizationId],
  };
};

/**
 * Insert a history row only when the subject still exists, so two concurrent
 * deletes cannot both log.
 */
export const insertChangeLogQuery = (
  record: ChangeLogRecord,
  requireTask?: { id: string; organizationId: string }
): SqlQuery => {
  const exists = existsClause(record);
  const alsoExists = requireTask
    ? {
        sql: ` AND EXISTS (SELECT 1 FROM tasks WHERE id = ? AND organization_id = ? AND deleted_at IS NULL)`,
        args: [requireTask.id, requireTask.organizationId],
      }
    : { sql: '', args: [] as unknown[] };
  return {
    sql: `
      INSERT INTO change_log (
        id, organization_id, project_id, subject_type, subject_id,
        kind, schema_version, payload_json, actor_user_id, actor_kind,
        occurred_at, hidden, seq
      )
      SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
             COALESCE((SELECT MAX(seq) FROM change_log), 0) + 1
      WHERE EXISTS (${exists.sql})${alsoExists.sql}
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
      ...exists.args,
      ...alsoExists.args,
    ],
  };
};

/**
 * Same as {@link insertChangeLogQuery}, but only if the previous statement
 * in this batch changed a row (`changes() > 0`). Used after a guarded
 * `UPDATE ... WHERE next_action_task_id = ?` so a 0-row clear writes no history.
 */
export const insertChangeLogIfChangedQuery = (record: ChangeLogRecord): SqlQuery => {
  const base = insertChangeLogQuery(record);
  return {
    sql: `${base.sql.trimEnd()} AND changes() > 0`,
    args: base.args,
  };
};

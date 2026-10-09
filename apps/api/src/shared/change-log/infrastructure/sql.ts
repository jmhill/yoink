import { UNLISTED_PILE_SUBJECT_ID } from '../domain/kinds.js';
import type { ChangeLogRecord } from '../domain/record.js';

export type SqlQuery = {
  sql: string;
  args?: unknown[];
};

const existsClause = (
  record: ChangeLogRecord
): { sql: string; args: unknown[] } => {
  if (record.subjectType === 'task') {
    return {
      sql: `SELECT 1 FROM tasks WHERE id = ? AND organization_id = ? AND deleted_at IS NULL`,
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
export const insertChangeLogQuery = (record: ChangeLogRecord): SqlQuery => {
  const exists = existsClause(record);
  return {
    sql: `
      INSERT INTO change_log (
        id, organization_id, project_id, subject_type, subject_id,
        kind, schema_version, payload_json, actor_user_id, actor_kind,
        occurred_at, hidden
      )
      SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      WHERE EXISTS (${exists.sql})
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
    ],
  };
};

import type { ChangeLogRecord } from '../domain/record.js';

export type SqlQuery = {
  sql: string;
  args?: unknown[];
};

export const insertChangeLogQuery = (record: ChangeLogRecord): SqlQuery => ({
  sql: `
    INSERT INTO change_log (
      id, organization_id, project_id, subject_type, subject_id,
      kind, schema_version, payload_json, actor_user_id, actor_kind,
      occurred_at, hidden
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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

import type { Project, Task } from '@yoink/api-contracts';
import type { SqlQuery } from '../../shared/change-log/infrastructure/sql.js';
import { insertProjectQuery } from '../../projects/infrastructure/project-row-statements.js';
import { insertTaskQuery } from '../../tasks/infrastructure/task-row-statements.js';

const inboxExistsSql = `
  EXISTS (
    SELECT 1 FROM captures
    WHERE id = ? AND organization_id = ? AND status = 'inbox' AND deleted_at IS NULL
  )
`;

export const insertProjectIfCaptureInInboxQuery = (
  project: Project,
  captureId: string
): SqlQuery => {
  const base = insertProjectQuery(project);
  return {
    sql: `
      INSERT INTO projects (
        id, organization_id, created_by_id, name, objective, status,
        waiting_on, waiting_since, next_action_task_id, notebook_pages,
        reason, suggested_next_action,
        created_at, last_changed_at, last_changed_by
      )
      SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      WHERE ${inboxExistsSql}
    `,
    args: [...(base.args ?? []), captureId, project.organizationId],
  };
};

export const insertTaskIfCaptureInInboxQuery = (task: Task, captureId: string): SqlQuery => {
  const base = insertTaskQuery(task);
  return {
    sql: `
      INSERT INTO tasks (
        id, organization_id, created_by_id, title, capture_id,
        due_date, completed_at, pinned_at, created_at, assignee_id, list_id,
        project_id, open_order, last_changed_at, last_changed_by, completed_by
      )
      SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      WHERE ${inboxExistsSql}
    `,
    args: [...(base.args ?? []), captureId, task.organizationId],
  };
};

export const markCaptureProcessedIfInboxQuery = (input: {
  id: string;
  organizationId: string;
  processedAt: string;
  processedToType: 'task' | 'project';
  processedToId: string;
}): SqlQuery => ({
  sql: `
    UPDATE captures SET
      status = 'processed',
      processed_at = ?,
      processed_to_type = ?,
      processed_to_id = ?
    WHERE id = ?
      AND organization_id = ?
      AND status = 'inbox'
      AND deleted_at IS NULL
  `,
  args: [
    input.processedAt,
    input.processedToType,
    input.processedToId,
    input.id,
    input.organizationId,
  ],
});

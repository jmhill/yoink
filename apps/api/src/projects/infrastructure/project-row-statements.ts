import type { Project } from '@yoink/api-contracts';
import type { SqlQuery } from '../../shared/change-log/infrastructure/sql.js';

export const insertProjectQuery = (project: Project): SqlQuery => ({
  sql: `
    INSERT INTO projects (
      id, organization_id, created_by_id, name, objective, status,
      waiting_on, waiting_since, next_action_task_id, created_at, last_changed_at, last_changed_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
  args: [
    project.id,
    project.organizationId,
    project.createdById,
    project.name,
    project.objective ?? null,
    project.status,
    project.waitingOn,
    project.waitingSince,
    project.nextActionTaskId,
    project.createdAt,
    project.lastChangedAt,
    project.lastChangedBy,
  ],
});

export const clearNextActionQuery = (input: {
  projectId: string;
  organizationId: string;
  previousTaskId: string;
  lastChangedAt: string | null;
  lastChangedBy: string | null;
}): SqlQuery => ({
  sql: `
    UPDATE projects
    SET next_action_task_id = NULL, last_changed_at = ?, last_changed_by = ?
    WHERE id = ? AND organization_id = ? AND next_action_task_id = ?
  `,
  args: [
    input.lastChangedAt,
    input.lastChangedBy,
    input.projectId,
    input.organizationId,
    input.previousTaskId,
  ],
});

export const updateProjectQuery = (project: Project): SqlQuery => ({
  sql: `
    UPDATE projects
    SET name = ?, objective = ?, status = ?, waiting_on = ?, waiting_since = ?,
        next_action_task_id = ?, last_changed_at = ?, last_changed_by = ?
    WHERE id = ? AND organization_id = ?
  `,
  args: [
    project.name,
    project.objective ?? null,
    project.status,
    project.waitingOn,
    project.waitingSince,
    project.nextActionTaskId,
    project.lastChangedAt,
    project.lastChangedBy,
    project.id,
    project.organizationId,
  ],
});

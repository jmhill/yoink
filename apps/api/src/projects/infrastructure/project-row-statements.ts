import type { Project } from '@yoink/api-contracts';
import type { SqlQuery } from '../../shared/change-log/infrastructure/sql.js';

export const insertProjectQuery = (project: Project): SqlQuery => ({
  sql: `
    INSERT INTO projects (
      id, organization_id, created_by_id, name, objective, status,
      waiting_on, waiting_since, next_action_task_id, notebook_pages,
      created_at, last_changed_at, last_changed_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
    JSON.stringify(project.notebookPages.map((page) => page.path)),
    project.createdAt,
    project.lastChangedAt,
    project.lastChangedBy,
  ],
});

export const insertImportedProjectQuery = (project: Project): SqlQuery =>
  insertProjectQuery({
    ...project,
    nextActionTaskId: null,
  });

export const markImportDecidedQuery = (input: {
  id: string;
  organizationId: string;
  status: 'applied' | 'discarded';
  decidedById: string;
  decidedAt: string;
}): SqlQuery => ({
  sql: `
    UPDATE project_imports
    SET status = CASE WHEN status = 'pending' THEN ? ELSE 'stale' END,
        decided_by = ?,
        decided_at = ?
    WHERE id = ? AND organization_id = ?
  `,
  args: [input.status, input.decidedById, input.decidedAt, input.id, input.organizationId],
});

export const setNextActionQuery = (input: {
  projectId: string;
  organizationId: string;
  nextActionTaskId: string;
  lastChangedAt: string | null;
  lastChangedBy: string | null;
}): SqlQuery => ({
  sql: `
    UPDATE projects
    SET next_action_task_id = ?, last_changed_at = ?, last_changed_by = ?
    WHERE id = ? AND organization_id = ? AND status <> 'done'
  `,
  args: [
    input.nextActionTaskId,
    input.lastChangedAt,
    input.lastChangedBy,
    input.projectId,
    input.organizationId,
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
        next_action_task_id = ?, notebook_pages = ?, last_changed_at = ?, last_changed_by = ?
    WHERE id = ? AND organization_id = ?
  `,
  args: [
    project.name,
    project.objective ?? null,
    project.status,
    project.waitingOn,
    project.waitingSince,
    project.nextActionTaskId,
    JSON.stringify(project.notebookPages.map((page) => page.path)),
    project.lastChangedAt,
    project.lastChangedBy,
    project.id,
    project.organizationId,
  ],
});

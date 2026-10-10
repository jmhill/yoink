import type { Project } from '@yoink/api-contracts';
import type { SqlQuery } from '../../shared/change-log/infrastructure/sql.js';

export const insertProjectQuery = (project: Project): SqlQuery => ({
  sql: `
    INSERT INTO projects (
      id, organization_id, created_by_id, name, objective, status, created_at,
      last_changed_at, last_changed_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
  args: [
    project.id,
    project.organizationId,
    project.createdById,
    project.name,
    project.objective ?? null,
    project.status,
    project.createdAt,
    project.lastChangedAt,
    project.lastChangedBy,
  ],
});

export const updateProjectQuery = (project: Project): SqlQuery => ({
  sql: `
    UPDATE projects
    SET name = ?, objective = ?, last_changed_at = ?, last_changed_by = ?
    WHERE id = ? AND organization_id = ?
  `,
  args: [
    project.name,
    project.objective ?? null,
    project.lastChangedAt,
    project.lastChangedBy,
    project.id,
    project.organizationId,
  ],
});

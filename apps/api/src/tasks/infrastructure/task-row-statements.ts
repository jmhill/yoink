import type { Task } from '@yoink/api-contracts';
import type { SqlQuery } from '../../shared/change-log/infrastructure/sql.js';

export const insertTaskQuery = (task: Task): SqlQuery => ({
  sql: `
    INSERT INTO tasks (
      id, organization_id, created_by_id, title, capture_id,
      due_date, completed_at, pinned_at, created_at, assignee_id, list_id,
      project_id, open_order, last_changed_at, last_changed_by, completed_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
  args: [
    task.id,
    task.organizationId,
    task.createdById,
    task.title,
    task.captureId ?? null,
    task.dueDate ?? null,
    task.completedAt ?? null,
    task.pinnedAt ?? null,
    task.createdAt,
    task.assigneeId ?? null,
    task.listId ?? null,
    task.projectId ?? null,
    task.openOrder ?? null,
    task.lastChangedAt,
    task.lastChangedBy,
    task.completedBy,
  ],
});

export const updateTaskQuery = (task: Task): SqlQuery => ({
  sql: `
    UPDATE tasks SET
      title = ?,
      due_date = ?,
      completed_at = ?,
      pinned_at = ?,
      assignee_id = ?,
      list_id = ?,
      project_id = ?,
      open_order = ?,
      last_changed_at = ?,
      last_changed_by = ?,
      completed_by = ?
    WHERE id = ?
      AND organization_id = ?
      AND deleted_at IS NULL
  `,
  args: [
    task.title,
    task.dueDate ?? null,
    task.completedAt ?? null,
    task.pinnedAt ?? null,
    task.assigneeId ?? null,
    task.listId ?? null,
    task.projectId ?? null,
    task.openOrder ?? null,
    task.lastChangedAt,
    task.lastChangedBy,
    task.completedBy,
    task.id,
    task.organizationId,
  ],
});

export const softDeleteTaskQuery = (
  id: string,
  organizationId: string,
  deletedAt: string
): SqlQuery => ({
  sql: `
    UPDATE tasks SET deleted_at = ?
    WHERE id = ? AND organization_id = ? AND deleted_at IS NULL
  `,
  args: [deletedAt, id, organizationId],
});

export const setOpenOrderQuery = (
  id: string,
  organizationId: string,
  openOrder: number,
  requireTaskId?: string
): SqlQuery => ({
  sql: requireTaskId
    ? `
    UPDATE tasks SET open_order = ?
    WHERE id = ? AND organization_id = ? AND deleted_at IS NULL
      AND EXISTS (
        SELECT 1 FROM tasks
        WHERE id = ? AND organization_id = ? AND deleted_at IS NULL
      )
  `
    : `
    UPDATE tasks SET open_order = ?
    WHERE id = ? AND organization_id = ? AND deleted_at IS NULL
  `,
  args: requireTaskId
    ? [openOrder, id, organizationId, requireTaskId, organizationId]
    : [openOrder, id, organizationId],
});

export const setOpenOrderQueries = (
  organizationId: string,
  updates: { id: string; openOrder: number }[],
  requireTaskId?: string
): SqlQuery[] =>
  updates.map((update) =>
    setOpenOrderQuery(update.id, organizationId, update.openOrder, requireTaskId)
  );

export const clearCompletedListIdQuery = (listId: string, organizationId: string): SqlQuery => ({
  sql: `
    UPDATE tasks
    SET list_id = NULL
    WHERE list_id = ?
      AND organization_id = ?
      AND (completed_at IS NOT NULL OR deleted_at IS NOT NULL)
  `,
  args: [listId, organizationId],
});

export const softDeleteCaptureQuery = (
  id: string,
  organizationId: string,
  deletedAt: string
): SqlQuery => ({
  sql: `
    UPDATE captures SET deleted_at = ?
    WHERE id = ? AND organization_id = ? AND deleted_at IS NULL
  `,
  args: [deletedAt, id, organizationId],
});

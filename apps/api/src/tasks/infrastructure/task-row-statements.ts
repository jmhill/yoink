import type { Task } from '@yoink/api-contracts';
import type { SqlQuery } from '../../shared/change-log/infrastructure/sql.js';

export const insertTaskQuery = (task: Task): SqlQuery => ({
  sql: `
    INSERT INTO tasks (
      id, organization_id, created_by_id, title, capture_id,
      due_date, completed_at, pinned_at, created_at, assignee_id, list_id,
      open_order, last_changed_at, last_changed_by, completed_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
    task.openOrder ?? null,
    task.lastChangedAt ?? null,
    task.lastChangedBy ?? null,
    task.completedBy ?? null,
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
      open_order = ?,
      last_changed_at = ?,
      last_changed_by = ?,
      completed_by = ?
    WHERE id = ?
  `,
  args: [
    task.title,
    task.dueDate ?? null,
    task.completedAt ?? null,
    task.pinnedAt ?? null,
    task.assigneeId ?? null,
    task.listId ?? null,
    task.openOrder ?? null,
    task.lastChangedAt ?? null,
    task.lastChangedBy ?? null,
    task.completedBy ?? null,
    task.id,
  ],
});

export const softDeleteTaskQuery = (id: string, deletedAt: string): SqlQuery => ({
  sql: `
    UPDATE tasks SET deleted_at = ?
    WHERE id = ? AND deleted_at IS NULL
  `,
  args: [deletedAt, id],
});

export const setOpenOrderQuery = (id: string, openOrder: number): SqlQuery => ({
  sql: `UPDATE tasks SET open_order = ? WHERE id = ?`,
  args: [openOrder, id],
});

export const setOpenOrderQueries = (
  updates: { id: string; openOrder: number }[]
): SqlQuery[] => updates.map((update) => setOpenOrderQuery(update.id, update.openOrder));

export const clearCompletedListIdQuery = (listId: string): SqlQuery => ({
  sql: `
    UPDATE tasks
    SET list_id = NULL
    WHERE list_id = ?
      AND (completed_at IS NOT NULL OR deleted_at IS NOT NULL)
  `,
  args: [listId],
});

export const softDeleteCaptureQuery = (id: string, deletedAt: string): SqlQuery => ({
  sql: `
    UPDATE captures SET deleted_at = ?
    WHERE id = ? AND deleted_at IS NULL
  `,
  args: [deletedAt, id],
});

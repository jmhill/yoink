import { err, ok, type Result } from 'neverthrow';
import { z } from 'zod';
import type { Task } from '@yoink/api-contracts';
import { storageError, type StorageError } from '../domain/task-errors.js';

const optionalText = z.string().min(1).nullable().optional();

const TaskRowSchema = z.object({
  id: z.string().min(1),
  organization_id: z.string().min(1),
  created_by_id: z.string().min(1),
  title: z.string().min(1),
  capture_id: optionalText,
  due_date: optionalText,
  completed_at: optionalText,
  pinned_at: optionalText,
  created_at: z.string().min(1),
  assignee_id: optionalText,
  list_id: optionalText,
  project_id: optionalText,
  open_order: z.union([z.number(), z.string(), z.null()]).optional(),
  last_changed_at: z.string().nullable().optional(),
  last_changed_by: optionalText,
  completed_by: optionalText,
});

export const parseTaskRow = (row: Record<string, unknown>): Result<Task, StorageError> => {
  const parsed = TaskRowSchema.safeParse(row);
  if (!parsed.success) {
    return err(storageError('Invalid task row', parsed.error));
  }

  const openOrderRaw = parsed.data.open_order;
  const openOrder =
    openOrderRaw === null || openOrderRaw === undefined
      ? undefined
      : Number(openOrderRaw);

  const task: Task = {
    id: parsed.data.id,
    organizationId: parsed.data.organization_id,
    createdById: parsed.data.created_by_id,
    title: parsed.data.title,
    createdAt: parsed.data.created_at,
    lastChangedAt: parsed.data.last_changed_at ?? null,
    lastChangedBy: parsed.data.last_changed_by ?? null,
    completedBy: parsed.data.completed_by ?? null,
  };

  if (parsed.data.capture_id) {
    task.captureId = parsed.data.capture_id;
  }
  if (parsed.data.due_date) {
    task.dueDate = parsed.data.due_date;
  }
  if (parsed.data.completed_at) {
    task.completedAt = parsed.data.completed_at;
  }
  if (parsed.data.pinned_at) {
    task.pinnedAt = parsed.data.pinned_at;
  }
  if (parsed.data.assignee_id) {
    task.assigneeId = parsed.data.assignee_id;
  }
  if (parsed.data.list_id) {
    task.listId = parsed.data.list_id;
  }
  if (parsed.data.project_id) {
    task.projectId = parsed.data.project_id;
  }
  if (openOrder !== undefined && Number.isFinite(openOrder)) {
    task.openOrder = openOrder;
  }

  return ok(task);
};

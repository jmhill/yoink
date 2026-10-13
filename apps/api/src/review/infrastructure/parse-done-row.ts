import { err, ok, type Result } from 'neverthrow';
import { z } from 'zod';
import { parseProjectRow } from '../../projects/infrastructure/parse-project-row.js';
import { parseTaskRow } from '../../tasks/infrastructure/parse-task-row.js';
import { storageError, type StorageError } from '../domain/review-errors.js';
import { asFinishedTaskOrNull, type DoneListRow } from '../domain/group-done.js';

const NextActionFieldsSchema = z.object({
  next_action_id: z.string().nullable().optional(),
  next_action_title: z.string().nullable().optional(),
});

const ProjectAliasSchema = z.object({
  p_id: z.string().min(1),
  p_organization_id: z.string().min(1),
  p_created_by_id: z.string().min(1),
  p_name: z.string().min(1),
  p_objective: z.string().nullable().optional(),
  p_status: z.enum(['active', 'waiting', 'someday', 'done', 'proposed', 'declined']),
  p_waiting_on: z.string().nullable().optional(),
  p_waiting_since: z.string().nullable().optional(),
  p_next_action_task_id: z.string().nullable().optional(),
  p_created_at: z.string().min(1),
  p_last_changed_at: z.string().nullable().optional(),
  p_last_changed_by: z.string().nullable().optional(),
  p_notebook_pages: z.string().optional(),
});

const nextActionFromRow = (
  parsed: z.infer<typeof NextActionFieldsSchema>
): DoneListRow['nextAction'] => {
  if (parsed.next_action_id === null || parsed.next_action_id === undefined) {
    return null;
  }
  if (parsed.next_action_title === null || parsed.next_action_title === undefined) {
    return null;
  }
  return {
    id: parsed.next_action_id,
    title: parsed.next_action_title,
  };
};

export const parseDoneListRow = (
  row: Record<string, unknown>
): Result<DoneListRow, StorageError> => {
  const task = parseTaskRow(row);
  if (task.isErr()) {
    return err(storageError('Invalid done-list task row', task.error));
  }
  const finished = asFinishedTaskOrNull(task.value);
  if (finished === null) {
    return err(storageError('Done-list task is missing completedAt', { taskId: task.value.id }));
  }

  const aliased = ProjectAliasSchema.safeParse(row);
  if (!aliased.success) {
    return err(storageError('Invalid done-list project row', aliased.error));
  }
  const project = parseProjectRow({
    id: aliased.data.p_id,
    organization_id: aliased.data.p_organization_id,
    created_by_id: aliased.data.p_created_by_id,
    name: aliased.data.p_name,
    objective: aliased.data.p_objective,
    status: aliased.data.p_status,
    waiting_on: aliased.data.p_waiting_on,
    waiting_since: aliased.data.p_waiting_since,
    next_action_task_id: aliased.data.p_next_action_task_id,
    created_at: aliased.data.p_created_at,
    last_changed_at: aliased.data.p_last_changed_at,
    last_changed_by: aliased.data.p_last_changed_by,
    notebook_pages: aliased.data.p_notebook_pages,
  });
  if (project.isErr()) {
    return err(storageError('Invalid done-list project row', project.error));
  }

  const extra = NextActionFieldsSchema.safeParse(row);
  if (!extra.success) {
    return err(storageError('Invalid done-list next-action row', extra.error));
  }

  return ok({
    task: finished,
    project: project.value,
    nextAction: nextActionFromRow(extra.data),
  });
};

import { err, ok, type Result } from 'neverthrow';
import { z } from 'zod';
import type { Project } from '@yoink/api-contracts';
import { storageError, type StorageError } from '../domain/project-errors.js';

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .nullable();

const ProjectRowSchema = z.object({
  id: z.string().min(1),
  organization_id: z.string().min(1),
  created_by_id: z.string().min(1),
  name: z.string().min(1),
  objective: z.string().nullable().optional(),
  status: z.enum(['active', 'waiting', 'someday', 'done', 'proposed']),
  waiting_on: z.string().nullable().optional(),
  waiting_since: isoDate.optional(),
  next_action_task_id: z.string().nullable().optional(),
  created_at: z.string().min(1),
  last_changed_at: z.string().nullable().optional(),
  last_changed_by: z.string().nullable().optional(),
});

export const parseProjectRow = (
  row: Record<string, unknown>
): Result<Project, StorageError> => {
  const parsed = ProjectRowSchema.safeParse(row);
  if (!parsed.success) {
    return err(storageError('Invalid project row', parsed.error));
  }

  const project: Project = {
    id: parsed.data.id,
    organizationId: parsed.data.organization_id,
    createdById: parsed.data.created_by_id,
    name: parsed.data.name,
    status: parsed.data.status,
    waitingOn: parsed.data.waiting_on ?? null,
    waitingSince: parsed.data.waiting_since ?? null,
    nextActionTaskId: parsed.data.next_action_task_id ?? null,
    createdAt: parsed.data.created_at,
    lastChangedAt: parsed.data.last_changed_at ?? null,
    lastChangedBy: parsed.data.last_changed_by ?? null,
  };

  if (parsed.data.objective) {
    project.objective = parsed.data.objective;
  }

  return ok(project);
};

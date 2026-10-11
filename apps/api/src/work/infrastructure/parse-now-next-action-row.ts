import { err, ok, type Result } from 'neverthrow';
import { z } from 'zod';
import type { NowNextActionItem } from '@yoink/api-contracts';
import { parseTaskRow } from '../../tasks/infrastructure/parse-task-row.js';
import { storageError, type StorageError } from '../domain/work-errors.js';

const ProjectFieldsSchema = z.object({
  now_project_id: z.string().min(1),
  now_project_name: z.string().min(1),
});

export const parseNowNextActionRow = (
  row: Record<string, unknown>
): Result<NowNextActionItem, StorageError> => {
  const task = parseTaskRow(row);
  if (task.isErr()) {
    return err(task.error);
  }
  const project = ProjectFieldsSchema.safeParse(row);
  if (!project.success) {
    return err(storageError('Invalid next-action row', project.error));
  }
  return ok({
    task: task.value,
    project: {
      id: project.data.now_project_id,
      name: project.data.now_project_name,
    },
  });
};

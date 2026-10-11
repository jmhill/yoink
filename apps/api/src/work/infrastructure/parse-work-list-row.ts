import { err, ok, type Result } from 'neverthrow';
import { z } from 'zod';
import type { WorkListCursorRow } from '../../listing/domain/list-keys.js';
import { storageError, type StorageError } from '../domain/work-errors.js';

const WorkListRowSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  created_at: z.string().min(1),
  open_task_count: z.union([z.number(), z.string()]),
});

export const parseWorkListRow = (
  row: Record<string, unknown>
): Result<WorkListCursorRow, StorageError> => {
  const parsed = WorkListRowSchema.safeParse(row);
  if (!parsed.success) {
    return err(storageError('Invalid work list row', parsed.error));
  }
  const openTaskCount = Number(parsed.data.open_task_count);
  if (!Number.isFinite(openTaskCount) || openTaskCount < 0) {
    return err(storageError('Invalid work list open-task count'));
  }
  return ok({
    id: parsed.data.id,
    name: parsed.data.name,
    createdAt: parsed.data.created_at,
    openTaskCount,
  });
};

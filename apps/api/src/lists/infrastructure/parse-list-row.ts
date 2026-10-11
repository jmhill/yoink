import { err, ok, type Result } from 'neverthrow';
import { z } from 'zod';
import type { NamedList } from '@yoink/api-contracts';
import { storageError, type StorageError } from '../domain/list-errors.js';

const ListRowSchema = z.object({
  id: z.string().min(1),
  organization_id: z.string().min(1),
  created_by_id: z.string().min(1),
  name: z.string().min(1),
  created_at: z.string().min(1),
});

export const parseListRow = (row: Record<string, unknown>): Result<NamedList, StorageError> => {
  const parsed = ListRowSchema.safeParse(row);
  if (!parsed.success) {
    return err(storageError('Invalid list row', parsed.error));
  }

  return ok({
    id: parsed.data.id,
    organizationId: parsed.data.organization_id,
    createdById: parsed.data.created_by_id,
    name: parsed.data.name,
    createdAt: parsed.data.created_at,
  });
};

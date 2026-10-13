import { err, ok, type Result } from 'neverthrow';
import { z } from 'zod';
import type { Note } from '@yoink/api-contracts';
import { storageError, type StorageError } from '../domain/note-errors.js';
import { noteExcerpt } from '../domain/parse-note-fields.js';
import type { NoteListItem } from '@yoink/api-contracts';

const NoteRowSchema = z.object({
  id: z.string().min(1),
  organization_id: z.string().min(1),
  project_id: z.string().min(1),
  title: z.string().min(1),
  body: z.string(),
  version: z.string().min(1),
  created_at: z.string().min(1),
  created_by: z.string().min(1),
  updated_at: z.string().min(1),
  updated_by: z.string().min(1),
  created_by_name: z.string().nullable().optional(),
  created_by_email: z.string().nullable().optional(),
  updated_by_name: z.string().nullable().optional(),
  updated_by_email: z.string().nullable().optional(),
});

const displayName = (name: string | null | undefined, email: string | null | undefined): string =>
  name ?? email ?? 'Unknown';

export const parseNoteRow = (row: Record<string, unknown>): Result<Note, StorageError> => {
  const parsed = NoteRowSchema.safeParse(row);
  if (!parsed.success) {
    return err(storageError('Invalid note row', parsed.error));
  }
  return ok({
    id: parsed.data.id,
    organizationId: parsed.data.organization_id,
    projectId: parsed.data.project_id,
    title: parsed.data.title,
    body: parsed.data.body,
    version: parsed.data.version,
    createdAt: parsed.data.created_at,
    createdById: parsed.data.created_by,
    createdByName: displayName(parsed.data.created_by_name, parsed.data.created_by_email),
    updatedAt: parsed.data.updated_at,
    updatedById: parsed.data.updated_by,
    updatedByName: displayName(parsed.data.updated_by_name, parsed.data.updated_by_email),
  });
};

export const parseNoteListItemRow = (
  row: Record<string, unknown>
): Result<NoteListItem, StorageError> => {
  const parsed = parseNoteRow(row);
  if (parsed.isErr()) {
    return err(parsed.error);
  }
  const note = parsed.value;
  return ok({
    id: note.id,
    organizationId: note.organizationId,
    projectId: note.projectId,
    title: note.title,
    excerpt: noteExcerpt(note.body),
    version: note.version,
    createdAt: note.createdAt,
    createdById: note.createdById,
    createdByName: note.createdByName,
    updatedAt: note.updatedAt,
    updatedById: note.updatedById,
    updatedByName: note.updatedByName,
  });
};

import { z } from 'zod';
import { ListPageMetaSchema, ListPageQuerySchema } from './list-page.js';

export const NOTE_TITLE_MAX_LENGTH = 120;
export const NOTE_BODY_MAX_LENGTH = 50_000;
export const NOTE_COPY_SUFFIX = ' (copy)';

export const copyNoteTitle = (title: string): string => {
  const maxBase = NOTE_TITLE_MAX_LENGTH - NOTE_COPY_SUFFIX.length;
  const base = title.length > maxBase ? title.slice(0, maxBase) : title;
  return `${base}${NOTE_COPY_SUFFIX}`;
};

const NoteTitleSchema = z.string().trim().min(1).max(NOTE_TITLE_MAX_LENGTH);

export const NoteSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string().uuid(),
  projectId: z.string().uuid(),
  title: z.string().min(1).max(NOTE_TITLE_MAX_LENGTH),
  body: z.string().max(NOTE_BODY_MAX_LENGTH),
  version: z.string().min(1),
  createdAt: z.string().datetime(),
  createdById: z.string().uuid(),
  createdByName: z.string(),
  updatedAt: z.string().datetime(),
  updatedById: z.string().uuid(),
  updatedByName: z.string(),
});

export type Note = z.infer<typeof NoteSchema>;

export const NoteListItemSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string().uuid(),
  projectId: z.string().uuid(),
  title: z.string().min(1).max(NOTE_TITLE_MAX_LENGTH),
  excerpt: z.string(),
  version: z.string().min(1),
  createdAt: z.string().datetime(),
  createdById: z.string().uuid(),
  createdByName: z.string(),
  updatedAt: z.string().datetime(),
  updatedById: z.string().uuid(),
  updatedByName: z.string(),
});

export type NoteListItem = z.infer<typeof NoteListItemSchema>;

export const NoteListPageSchema = ListPageMetaSchema.extend({
  notes: z.array(NoteListItemSchema),
});

export type NoteListPage = z.infer<typeof NoteListPageSchema>;

export const CreateNoteSchema = z.object({
  title: NoteTitleSchema,
  body: z.string().max(NOTE_BODY_MAX_LENGTH).optional(),
});

export type CreateNote = z.infer<typeof CreateNoteSchema>;

export const UpdateNoteSchema = z
  .object({
    title: NoteTitleSchema.optional(),
    body: z.string().max(NOTE_BODY_MAX_LENGTH).optional(),
    expectedVersion: z.string().min(1),
  })
  .refine((body) => body.title !== undefined || body.body !== undefined, {
    message: 'Provide a title or body',
  });

export type UpdateNote = z.infer<typeof UpdateNoteSchema>;

export const NOTE_SYNC_ORIGIN = 'obsidian' as const;

export const NoteUpsertedChangeSchema = NoteSchema.extend({
  kind: z.literal('upserted'),
  projectName: z.string(),
});

export type NoteUpsertedChange = z.infer<typeof NoteUpsertedChangeSchema>;

export const NoteDeletedChangeSchema = z.object({
  kind: z.literal('deleted'),
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  projectName: z.string(),
  createdAt: z.string().datetime(),
  deletedAt: z.string().datetime(),
});

export type NoteDeletedChange = z.infer<typeof NoteDeletedChangeSchema>;

export const NoteChangeSchema = z.discriminatedUnion('kind', [
  NoteUpsertedChangeSchema,
  NoteDeletedChangeSchema,
]);

export type NoteChange = z.infer<typeof NoteChangeSchema>;

export const NoteChangePageSchema = ListPageMetaSchema.extend({
  changes: z.array(NoteChangeSchema),
});

export type NoteChangePage = z.infer<typeof NoteChangePageSchema>;

export const ListNotesChangedQuerySchema = ListPageQuerySchema.extend({
  since: z.string().datetime(),
});

export type ListNotesChangedQuery = z.infer<typeof ListNotesChangedQuerySchema>;

export const ImportNoteFromObsidianSchema = z
  .object({
    projectId: z.string().uuid(),
    noteId: z.string().uuid().optional(),
    title: NoteTitleSchema,
    body: z.string().max(NOTE_BODY_MAX_LENGTH),
    baseVersion: z.string().min(1).optional(),
  })
  .refine((body) => body.noteId === undefined || body.baseVersion !== undefined, {
    message: 'baseVersion is required when updating an existing note',
    path: ['baseVersion'],
  });

export type ImportNoteFromObsidian = z.infer<typeof ImportNoteFromObsidianSchema>;

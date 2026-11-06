import { oc } from '@orpc/contract';
import { openapi } from '@orpc/openapi';
import { z } from 'zod';
import { ListPageQuerySchema } from '../schemas/list-page.js';
import {
  CreateNoteSchema,
  ImportNoteFromObsidianSchema,
  ListNotesChangedQuerySchema,
  NoteChangePageSchema,
  NoteListPageSchema,
  NoteSchema,
  UpdateNoteSchema,
} from '../schemas/note.js';

/**
 * Query values are JSON-parsed (`queryStyles: 'json'`), so numbers stay
 * numbers and `false` stays false.
 */
const noteListQueryStyles = {
  limit: 'json',
  cursor: 'json',
} as const;

const noteChangedQueryStyles = {
  limit: 'json',
  cursor: 'json',
  since: 'json',
} as const;

const projectIdParams = z.object({
  projectId: z.string().uuid(),
});

const noteParams = z.object({
  projectId: z.string().uuid(),
  noteId: z.string().uuid(),
});

const noteImportOutput = z.object({
  status: z.union([z.literal(200), z.literal(201)]),
  body: NoteSchema,
});

export const noteOrpcContract = oc.router({
  list: oc
    .meta(
      openapi({
        method: 'GET',
        path: '/api/projects/{projectId}/notes',
        summary: "List a project's notes, most recently edited first, without bodies",
        queryStyles: noteListQueryStyles,
      })
    )
    .input(projectIdParams.merge(ListPageQuerySchema))
    .output(NoteListPageSchema),
  get: oc
    .meta(
      openapi({
        method: 'GET',
        path: '/api/projects/{projectId}/notes/{noteId}',
        summary: 'Read one note including its markdown body and version',
      })
    )
    .input(noteParams)
    .output(NoteSchema),
  create: oc
    .meta(
      openapi({
        method: 'POST',
        path: '/api/projects/{projectId}/notes',
        successStatus: 201,
        summary: 'Create a project note (people and bots)',
      })
    )
    .input(projectIdParams.merge(CreateNoteSchema))
    .output(NoteSchema),
  update: oc
    .meta(
      openapi({
        method: 'PATCH',
        path: '/api/projects/{projectId}/notes/{noteId}',
        summary: 'Edit a note when expectedVersion still matches',
      })
    )
    .input(noteParams.and(UpdateNoteSchema))
    .output(NoteSchema),
  delete: oc
    .meta(
      openapi({
        method: 'DELETE',
        path: '/api/projects/{projectId}/notes/{noteId}',
        successStatus: 204,
        summary: 'Soft-delete a note. Later reads return 404.',
      })
    )
    .input(noteParams)
    .output(z.void()),
  listChanged: oc
    .meta(
      openapi({
        method: 'GET',
        path: '/api/notes/changed',
        summary:
          'Org-scoped notes changed since a timestamp, including delete tombstones. For the notes-mirror bot.',
        queryStyles: noteChangedQueryStyles,
      })
    )
    .input(ListNotesChangedQuerySchema)
    .output(NoteChangePageSchema),
  importFromObsidian: oc
    .meta(
      openapi({
        method: 'POST',
        path: '/api/notes/import',
        outputStructure: 'detailed',
        summary:
          'Create or update a note from the Obsidian mirror. Attributes the edit to the org person as an Obsidian-origin save.',
      })
    )
    .input(ImportNoteFromObsidianSchema)
    .output(noteImportOutput),
});

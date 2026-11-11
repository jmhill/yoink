import { oc } from '@orpc/contract';
import { openapi } from '@orpc/openapi';
import { z } from 'zod';
import { ListPageQuerySchema } from '../schemas/list-page.js';
import {
  CreateNoteSchema,
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

const projectIdParams = z.object({
  projectId: z.string().uuid(),
});

const noteParams = z.object({
  projectId: z.string().uuid(),
  noteId: z.string().uuid(),
});

/**
 * Project notes the web app reads and writes. Paths are the resource after
 * `/web-api`. Import and changed stay on `/api` for the notes-mirror bot.
 * The same list, get, create, update, and delete stay on `/api` and `/api/v1`.
 */
export const webNotesContract = oc.router({
  list: oc
    .meta(
      openapi({
        method: 'GET',
        path: '/projects/{projectId}/notes',
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
        path: '/projects/{projectId}/notes/{noteId}',
        summary: 'Read one note including its markdown body and version',
      })
    )
    .input(noteParams)
    .output(NoteSchema),
  create: oc
    .meta(
      openapi({
        method: 'POST',
        path: '/projects/{projectId}/notes',
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
        path: '/projects/{projectId}/notes/{noteId}',
        summary: 'Edit a note when expectedVersion still matches',
      })
    )
    .input(noteParams.and(UpdateNoteSchema))
    .output(NoteSchema),
  delete: oc
    .meta(
      openapi({
        method: 'DELETE',
        path: '/projects/{projectId}/notes/{noteId}',
        successStatus: 204,
        summary: 'Soft-delete a note. Later reads return 404.',
      })
    )
    .input(noteParams)
    .output(z.void()),
});

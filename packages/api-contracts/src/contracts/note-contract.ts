import { initContract } from '@ts-rest/core';
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
import { ErrorSchema, NoteSyncConflictErrorSchema, StaleNoteErrorSchema } from '../schemas/error.js';

const c = initContract();

const projectIdParams = z.object({
  projectId: z.string().uuid(),
});

const noteParams = z.object({
  projectId: z.string().uuid(),
  noteId: z.string().uuid(),
});

export const noteContract = c.router(
  {
    list: {
      method: 'GET',
      path: '/api/projects/:projectId/notes',
      pathParams: projectIdParams,
      query: ListPageQuerySchema,
      responses: {
        200: NoteListPageSchema,
        400: ErrorSchema,
        401: ErrorSchema,
        404: ErrorSchema,
        500: ErrorSchema,
      },
      summary: "List a project's notes, most recently edited first, without bodies",
    },

    get: {
      method: 'GET',
      path: '/api/projects/:projectId/notes/:noteId',
      pathParams: noteParams,
      responses: {
        200: NoteSchema,
        401: ErrorSchema,
        404: ErrorSchema,
        500: ErrorSchema,
      },
      summary: 'Read one note including its markdown body and version',
    },

    create: {
      method: 'POST',
      path: '/api/projects/:projectId/notes',
      pathParams: projectIdParams,
      body: CreateNoteSchema,
      responses: {
        201: NoteSchema,
        400: ErrorSchema,
        401: ErrorSchema,
        404: ErrorSchema,
        500: ErrorSchema,
      },
      summary: 'Create a project note (people and bots)',
    },

    update: {
      method: 'PATCH',
      path: '/api/projects/:projectId/notes/:noteId',
      pathParams: noteParams,
      body: UpdateNoteSchema,
      responses: {
        200: NoteSchema,
        400: ErrorSchema,
        401: ErrorSchema,
        404: ErrorSchema,
        409: StaleNoteErrorSchema,
        500: ErrorSchema,
      },
      summary: 'Edit a note when expectedVersion still matches',
    },

    delete: {
      method: 'DELETE',
      path: '/api/projects/:projectId/notes/:noteId',
      pathParams: noteParams,
      body: z.object({}),
      responses: {
        204: z.undefined(),
        401: ErrorSchema,
        404: ErrorSchema,
        500: ErrorSchema,
      },
      summary: 'Soft-delete a note. Later reads return 404.',
    },

    listChanged: {
      method: 'GET',
      path: '/api/notes/changed',
      query: ListNotesChangedQuerySchema,
      responses: {
        200: NoteChangePageSchema,
        400: ErrorSchema,
        401: ErrorSchema,
        500: ErrorSchema,
      },
      summary:
        'Org-scoped notes changed since a timestamp, including delete tombstones. For the notes-mirror bot.',
    },

    importFromObsidian: {
      method: 'POST',
      path: '/api/notes/import',
      body: ImportNoteFromObsidianSchema,
      responses: {
        200: NoteSchema,
        201: NoteSchema,
        400: ErrorSchema,
        401: ErrorSchema,
        403: ErrorSchema,
        404: ErrorSchema,
        409: NoteSyncConflictErrorSchema,
        500: ErrorSchema,
      },
      summary:
        'Create or update a note from the Obsidian mirror. Attributes the edit to the org person as an Obsidian-origin save.',
    },
  },
  {
    strictStatusCodes: true,
  }
);

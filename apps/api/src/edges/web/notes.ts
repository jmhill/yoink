import { implement } from '@orpc/server';
import type { Note as ContractNote, NoteListItem as ContractNoteListItem } from '@yoink/api-contracts';
import { webNotesContract } from '@yoink/api-contracts/web';
import { toNoteListBody } from '../_shared/http-listed-page.js';
import type { OrpcHttpContext } from '../_shared/orpc/http-context.js';
import type { Note, NoteListItem, Notes } from '../../modules/notes/index.js';
import {
  mapCreateNoteError,
  mapDeleteNoteError,
  mapGetNoteError,
  mapListNotesError,
  mapUpdateNoteError,
} from './notes-errors.js';

/**
 * Methods this screen calls. Import and changed stay off the port.
 */
export type WebNotesDependencies = {
  noteHandlers: {
    queries: Pick<Notes['queries'], 'listNotes' | 'getNote'>;
    commands: Pick<Notes['commands'], 'createNote' | 'updateNote' | 'deleteNote'>;
  };
};

/** Copy a note document onto the contract note, in schema field order. */
const toContractNote = (note: Note): ContractNote => ({
  id: note.id,
  organizationId: note.organizationId,
  projectId: note.projectId,
  title: note.title,
  body: note.body,
  version: note.version,
  createdAt: note.createdAt,
  createdById: note.createdById,
  createdByName: note.createdByName,
  updatedAt: note.updatedAt,
  updatedById: note.updatedById,
  updatedByName: note.updatedByName,
});

/** Copy a list row onto the contract list item, in schema field order. */
const toContractNoteListItem = (item: NoteListItem): ContractNoteListItem => ({
  id: item.id,
  organizationId: item.organizationId,
  projectId: item.projectId,
  title: item.title,
  excerpt: item.excerpt,
  version: item.version,
  createdAt: item.createdAt,
  createdById: item.createdById,
  createdByName: item.createdByName,
  updatedAt: item.updatedAt,
  updatedById: item.updatedById,
  updatedByName: item.updatedByName,
});

/**
 * Project notes list, get, create, update, and delete. Each handler calls one
 * notes query or command. The edge copies the document onto the contract
 * types and does not sort. Public v1 and the `/api` alias keep today's paths,
 * status, and error body. Import and changed stay on `/api`.
 */
export const createWebNotesHandlers = (deps: WebNotesDependencies) => {
  const notes = implement(webNotesContract).$context<OrpcHttpContext>();

  return notes.router({
    list: notes.list.handler(async ({ input, context }) => {
      const result = await deps.noteHandlers.queries.listNotes({
        projectId: input.projectId,
        organizationId: context.request.authContext.organizationId,
        limit: input.limit,
        cursor: input.cursor,
      });
      return result.match(
        (page) =>
          toNoteListBody({
            items: page.items.map(toContractNoteListItem),
            hasMore: page.hasMore,
            nextCursor: page.nextCursor,
            total: page.total,
          }),
        (error) => {
          throw mapListNotesError(error);
        }
      );
    }),
    get: notes.get.handler(async ({ input, context }) => {
      const result = await deps.noteHandlers.queries.getNote({
        noteId: input.noteId,
        projectId: input.projectId,
        organizationId: context.request.authContext.organizationId,
      });
      return result.match(
        (note) => toContractNote(note),
        (error) => {
          throw mapGetNoteError(error);
        }
      );
    }),
    create: notes.create.handler(async ({ input, context }) => {
      const result = await deps.noteHandlers.commands.createNote({
        projectId: input.projectId,
        organizationId: context.request.authContext.organizationId,
        title: input.title,
        body: input.body,
        actor: context.request.authContext.actor,
      });
      return result.match(
        ({ view }) => toContractNote(view),
        (error) => {
          throw mapCreateNoteError(error);
        }
      );
    }),
    update: notes.update.handler(async ({ input, context }) => {
      const result = await deps.noteHandlers.commands.updateNote({
        noteId: input.noteId,
        projectId: input.projectId,
        organizationId: context.request.authContext.organizationId,
        title: input.title,
        body: input.body,
        expectedVersion: input.expectedVersion,
        actor: context.request.authContext.actor,
      });
      return result.match(
        ({ view }) => toContractNote(view),
        (error) => {
          throw mapUpdateNoteError(error);
        }
      );
    }),
    delete: notes.delete.handler(async ({ input, context }) => {
      const result = await deps.noteHandlers.commands.deleteNote({
        noteId: input.noteId,
        projectId: input.projectId,
        organizationId: context.request.authContext.organizationId,
        actor: context.request.authContext.actor,
      });
      return result.match(
        () => undefined,
        (error) => {
          throw mapDeleteNoteError(error);
        }
      );
    }),
  });
};

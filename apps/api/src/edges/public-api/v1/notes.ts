import { OpenAPIHandler } from '@orpc/openapi/fastify';
import { implement } from '@orpc/server';
import { noteOrpcContract } from '@yoink/api-contracts/orpc';
import { publicApiV1Contract } from '@yoink/api-contracts/public-api/v1';
import { toNoteListBody } from '../../_shared/http-listed-page.js';
import { openApiHandlerOptions } from '../../_shared/orpc/handler-options.js';
import {
  toContractNote,
  toContractNoteChangePage,
  toContractNoteListItem,
} from './map-note-document.js';
import type { OrpcHttpContext } from '../../_shared/orpc/http-context.js';
import type { Notes } from '../../../modules/notes/index.js';
import { noteRequestValidationError } from './note-http-errors.js';
import {
  mapCreateNoteError,
  mapDeleteNoteError,
  mapGetNoteError,
  mapImportNoteError,
  mapListNotesChangedError,
  mapListNotesError,
  mapUpdateNoteError,
} from './orpc-note-errors.js';

export type NoteEdgeDependencies = { noteHandlers: Notes };

type Procedure<T> = T extends { handler: (fn: infer Fn) => unknown } ? Fn : never;

export const createNoteHandlers = (deps: NoteEdgeDependencies) => {
  const legacy = implement(noteOrpcContract).$context<OrpcHttpContext>();
  const v1 = implement(publicApiV1Contract.notes).$context<OrpcHttpContext>();

  const list: Procedure<typeof legacy.list> = async ({ input, context }) => {
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
      },
    );
  };
  const get: Procedure<typeof legacy.get> = async ({ input, context }) => {
    const result = await deps.noteHandlers.queries.getNote({
      noteId: input.noteId,
      projectId: input.projectId,
      organizationId: context.request.authContext.organizationId,
    });
    return result.match(
      (note) => toContractNote(note),
      (error) => {
        throw mapGetNoteError(error);
      },
    );
  };
  const create: Procedure<typeof legacy.create> = async ({ input, context }) => {
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
      },
    );
  };
  const update: Procedure<typeof legacy.update> = async ({ input, context }) => {
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
      },
    );
  };
  const listChanged: Procedure<typeof legacy.listChanged> = async ({ input, context }) => {
    const result = await deps.noteHandlers.queries.listNotesChanged({
      organizationId: context.request.authContext.organizationId,
      since: input.since,
      limit: input.limit,
      cursor: input.cursor,
    });
    return result.match(
      (page) => toContractNoteChangePage(page),
      (error) => {
        throw mapListNotesChangedError(error);
      },
    );
  };
  const importFromObsidian: Procedure<typeof legacy.importFromObsidian> = async ({ input, context }) => {
    const result = await deps.noteHandlers.commands.importNote({
      organizationId: context.request.authContext.organizationId,
      projectId: input.projectId,
      noteId: input.noteId,
      title: input.title,
      body: input.body,
      baseVersion: input.baseVersion,
      actor: context.request.authContext.actor,
    });
    return result.match(
      ({ view, created }) => ({
        status: created ? 201 : 200,
        body: toContractNote(view),
      }),
      (error) => {
        throw mapImportNoteError(error);
      },
    );
  };
  const deleteNote: Procedure<typeof legacy.delete> = async ({ input, context }) => {
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
      },
    );
  };

  const options = openApiHandlerOptions(noteRequestValidationError);
  const legacyRouter = legacy.router({
    list: legacy.list.handler(list),
    get: legacy.get.handler(get),
    create: legacy.create.handler(create),
    update: legacy.update.handler(update),
    listChanged: legacy.listChanged.handler(listChanged),
    importFromObsidian: legacy.importFromObsidian.handler(importFromObsidian),
    delete: legacy.delete.handler(deleteNote),
  });
  const v1Router = v1.router({
    list: v1.list.handler(list),
    get: v1.get.handler(get),
    create: v1.create.handler(create),
    update: v1.update.handler(update),
    listChanged: v1.listChanged.handler(listChanged),
    importFromObsidian: v1.importFromObsidian.handler(importFromObsidian),
    delete: v1.delete.handler(deleteNote),
  });
  return {
    legacy: new OpenAPIHandler(legacyRouter, options),
    v1: new OpenAPIHandler(v1Router, options),
  };
};

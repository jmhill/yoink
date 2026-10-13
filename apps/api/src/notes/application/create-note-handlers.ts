import { handleCreateNote } from './handle-create-note.js';
import { handleUpdateNote } from './handle-update-note.js';
import { handleDeleteNote } from './handle-delete-note.js';
import { handleListNotes } from './handle-list-notes.js';
import { handleGetNote } from './handle-get-note.js';
import type { LoadActorName, LoadProject, NotesBackend } from './ports.js';
import {
  withCommandLog,
  type CommandLogger,
} from '../../shared/change-log/application/command-log.js';

export type NoteHandlerDeps = {
  backend: NotesBackend;
  loadProject: LoadProject;
  loadActorName: LoadActorName;
  nextId: () => string;
  now: () => string;
  logger: CommandLogger;
};

export const createNoteHandlers = (deps: NoteHandlerDeps) => ({
  list: (query: Parameters<typeof handleListNotes>[0]) => handleListNotes(query, deps),
  get: (query: Parameters<typeof handleGetNote>[0]) => handleGetNote(query, deps),
  create: (command: Parameters<typeof handleCreateNote>[0]) =>
    withCommandLog(
      deps.logger,
      {
        command: 'CreateNote',
        organizationId: command.organizationId,
        actor: command.actor,
      },
      (result) => [result.event.type],
      () => handleCreateNote(command, deps)
    ),
  update: (command: Parameters<typeof handleUpdateNote>[0]) =>
    withCommandLog(
      deps.logger,
      {
        command: 'UpdateNote',
        organizationId: command.organizationId,
        actor: command.actor,
      },
      (result) => [result.event.type],
      () => handleUpdateNote(command, deps)
    ),
  delete: (command: Parameters<typeof handleDeleteNote>[0]) =>
    withCommandLog(
      deps.logger,
      {
        command: 'DeleteNote',
        organizationId: command.organizationId,
        actor: command.actor,
      },
      (result) => [result.event.type],
      () => handleDeleteNote(command, deps)
    ),
});

export type NoteHandlers = ReturnType<typeof createNoteHandlers>;

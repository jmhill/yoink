import type { UnitOfWork } from '../../../kernel/unit-of-work.js';
import { withCommandLog, type CommandLogger } from '../../../kernel/command-log.js';
import { handleCreateNote } from './handlers/handle-create-note.js';
import { handleUpdateNote } from './handlers/handle-update-note.js';
import { handleDeleteNote } from './handlers/handle-delete-note.js';
import { handleListNotes } from './handlers/handle-list-notes.js';
import { handleGetNote } from './handlers/handle-get-note.js';
import { handleListNotesChanged } from './handlers/handle-list-notes-changed.js';
import { handleImportNote } from './handlers/handle-import-note.js';
import type {
  LoadActorName,
  LoadNotesMirrorBot,
  LoadOrgPerson,
  LoadProject,
  NotesBackend,
} from './ports.js';

export type NoteHandlerDeps = {
  backend: NotesBackend;
  loadProject: LoadProject;
  loadActorName: LoadActorName;
  loadOrgPerson: LoadOrgPerson;
  loadNotesMirrorBot: LoadNotesMirrorBot;
  uow: UnitOfWork;
  nextId: () => string;
  now: () => string;
  logger: CommandLogger;
};

export const createNotes = (deps: NoteHandlerDeps) => ({
  commands: {
    createNote: (command: Parameters<typeof handleCreateNote>[0]) =>
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
    updateNote: (command: Parameters<typeof handleUpdateNote>[0]) =>
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
    deleteNote: (command: Parameters<typeof handleDeleteNote>[0]) =>
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
    importNote: (command: Parameters<typeof handleImportNote>[0]) =>
      withCommandLog(
        deps.logger,
        {
          command: 'ImportNoteFromObsidian',
          organizationId: command.organizationId,
          actor: command.actor,
        },
        (result) => (result.event.type === 'unchanged' ? [] : [result.event.type]),
        () => handleImportNote(command, deps)
      ),
  },
  queries: {
    listNotes: (query: Parameters<typeof handleListNotes>[0]) => handleListNotes(query, deps),
    getNote: (query: Parameters<typeof handleGetNote>[0]) => handleGetNote(query, deps),
    listNotesChanged: (query: Parameters<typeof handleListNotesChanged>[0]) =>
      handleListNotesChanged(query, deps),
  },
  prepare: {},
});

export type Notes = ReturnType<typeof createNotes>;

import { errAsync, okAsync, type ResultAsync } from 'neverthrow';
import type { Note } from '@yoink/api-contracts';
import type { ImportNoteFromObsidianCommand } from '../domain/note-commands.js';
import type { NoteCreated, NoteUpdated } from '../domain/events.js';
import {
  noteImportRequiresBotError,
  noteNotFoundError,
  noteSyncNoPersonError,
  projectNotFoundError,
  storageError,
  type ImportNoteError,
} from '../domain/note-errors.js';
import { decideImportNote } from '../domain/decide-import.js';
import { planNoteChange } from '../domain/plan-note-change.js';
import type { LoadOrgPerson, LoadProject, NotesBackend } from './ports.js';

export type HandleImportNoteDeps = {
  backend: NotesBackend;
  loadProject: LoadProject;
  loadOrgPerson: LoadOrgPerson;
  nextId: () => string;
  now: () => string;
};

export type ImportNoteResult = {
  event: NoteCreated | NoteUpdated | { type: 'unchanged' };
  view: Note;
  created: boolean;
};

export const handleImportNote = (
  command: ImportNoteFromObsidianCommand,
  deps: HandleImportNoteDeps
): ResultAsync<ImportNoteResult, ImportNoteError> => {
  if (command.actor.kind !== 'bot') {
    return errAsync(noteImportRequiresBotError());
  }

  return deps.loadProject(command.projectId).andThen((project) => {
    if (!project || project.organizationId !== command.organizationId) {
      return errAsync(projectNotFoundError(command.projectId));
    }

    return deps.loadOrgPerson(command.organizationId).andThen((person) => {
      if (!person) {
        return errAsync(noteSyncNoPersonError());
      }

      const loadCurrent =
        command.noteId === undefined
          ? okAsync(null)
          : deps.backend.get({
              organizationId: command.organizationId,
              projectId: command.projectId,
              noteId: command.noteId,
            });

      return loadCurrent.andThen((loaded) => {
        if (command.noteId !== undefined && loaded === null) {
          return errAsync(noteNotFoundError(command.noteId));
        }

        const now = deps.now();
        const decision = decideImportNote({
          command,
          current: loaded,
          authorUserId: person.userId,
          nextId: deps.nextId(),
          nextVersion: loaded ? deps.backend.nextVersion(loaded.version) : '1',
          now,
        });
        if (decision.isErr()) {
          return errAsync(decision.error);
        }

        if (decision.value.type === 'unchanged') {
          return okAsync({
            event: { type: 'unchanged' as const },
            view: decision.value.view,
            created: false,
          });
        }

        const author = {
          kind: 'user' as const,
          userId: person.userId,
          via: 'token' as const,
        };
        const event = decision.value;
        const ids = { recordId: deps.nextId() };
        const plan =
          event.type === 'NoteCreated'
            ? planNoteChange({
                event,
                current: null,
                actor: author,
                actorName: person.name,
                ids,
              })
            : loaded
              ? planNoteChange({
                  event,
                  current: loaded,
                  actor: author,
                  actorName: person.name,
                  ids,
                })
              : null;
        if (plan === null) {
          return errAsync(noteNotFoundError(command.noteId ?? event.id));
        }
        return deps.backend
          .persist(plan)
          .mapErr((error) =>
            error.type === 'STALE_NOTE'
              ? storageError('Unexpected stale note on Obsidian import')
              : error
          )
          .map(() => ({
            event,
            view: plan.view,
            created: event.type === 'NoteCreated',
          }));
      });
    });
  });
};

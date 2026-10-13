import { errAsync, type ResultAsync } from 'neverthrow';
import type { DeleteNoteCommand } from '../domain/note-commands.js';
import type { NoteDeleted } from '../domain/events.js';
import {
  noteNotFoundError,
  projectNotFoundError,
  storageError,
  type DeleteNoteError,
} from '../domain/note-errors.js';
import { decideDeleteNote } from '../domain/decide-delete.js';
import { planNoteChange } from '../domain/plan-note-change.js';
import type { LoadActorName, LoadProject, NotesBackend } from './ports.js';

export type HandleDeleteNoteDeps = {
  backend: NotesBackend;
  loadProject: LoadProject;
  loadActorName: LoadActorName;
  nextId: () => string;
  now: () => string;
};

export type DeleteNoteResult = {
  event: NoteDeleted;
};

export const handleDeleteNote = (
  command: DeleteNoteCommand,
  deps: HandleDeleteNoteDeps
): ResultAsync<DeleteNoteResult, DeleteNoteError> => {
  return deps.loadProject(command.projectId).andThen((project) => {
    if (!project || project.organizationId !== command.organizationId) {
      return errAsync(projectNotFoundError(command.projectId));
    }

    return deps
      .backend.get({
        organizationId: command.organizationId,
        projectId: command.projectId,
        noteId: command.noteId,
      })
      .andThen((loaded) => {
        if (!loaded) {
          return errAsync(noteNotFoundError(command.noteId));
        }

        const decision = decideDeleteNote({
          command,
          current: loaded,
          now: deps.now(),
        });
        if (decision.isErr()) {
          return errAsync(decision.error);
        }

        return deps.loadActorName(command.actor.userId).andThen((actorName) => {
          const event = decision.value;
          const plan = planNoteChange({
            event,
            current: loaded,
            actor: command.actor,
            actorName,
            ids: { recordId: deps.nextId() },
          });
          return deps.backend.persist(plan).mapErr((error) =>
            error.type === 'STALE_NOTE' ? storageError('Unexpected stale note on delete') : error
          ).map(() => ({ event }));
        });
      });
  });
};

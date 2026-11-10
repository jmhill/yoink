import { errAsync, type ResultAsync } from 'neverthrow';
import type { UnitOfWork } from '../../../../kernel/unit-of-work.js';
import type { DeleteNoteCommand } from '../../domain/messages/note-commands.js';
import type { NoteDeleted } from '../../domain/messages/events.js';
import {
  noteNotFoundError,
  projectNotFoundError,
  storageError,
  type DeleteNoteError,
} from '../../domain/messages/note-errors.js';
import { decideDeleteNote } from '../../domain/decisions/decide-delete.js';
import { planNoteChange } from '../../domain/projections/plan-note-change.js';
import { toNoteIntegrationEvent } from '../integration-events/to-note-integration-event.js';
import type { LoadActorName, LoadProject, NotesBackend } from '../ports.js';
import { commitNote, noteWork } from '../support/commit-note.js';

export type HandleDeleteNoteDeps = {
  backend: NotesBackend;
  loadProject: LoadProject;
  loadActorName: LoadActorName;
  uow: UnitOfWork;
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
          });
          const occurredAt = deps.now();
          return commitNote(
            deps.uow,
            noteWork({
              result: { event },
              plan,
              event: toNoteIntegrationEvent({
                event,
                id: deps.nextId(),
                occurredAt,
                actor: command.actor,
              }),
            })
          ).orElse((failure) =>
            errAsync(
              failure.kind === 'Conflict' && failure.reason === 'note-missing'
                ? noteNotFoundError(command.noteId)
                : storageError('Failed to persist note change', failure)
            )
          );
        });
      });
  });
};

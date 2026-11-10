import { errAsync, type ResultAsync } from 'neverthrow';
import type { Note } from '@yoink/api-contracts';
import type { UnitOfWork } from '../../../../kernel/unit-of-work.js';
import type { UpdateNoteCommand } from '../../domain/messages/note-commands.js';
import type { NoteUpdated } from '../../domain/messages/events.js';
import {
  noteNotFoundError,
  projectNotFoundError,
  type UpdateNoteError,
} from '../../domain/messages/note-errors.js';
import { decideUpdateNote } from '../../domain/decisions/decide-update.js';
import { planNoteChange } from '../../domain/projections/plan-note-change.js';
import { toNoteIntegrationEvent } from '../integration-events/to-note-integration-event.js';
import type { LoadActorName, LoadProject, NotesBackend } from '../ports.js';
import { commitNote, mapNoteCommitFailure, noteWork } from '../support/commit-note.js';

export type HandleUpdateNoteDeps = {
  backend: NotesBackend;
  loadProject: LoadProject;
  loadActorName: LoadActorName;
  uow: UnitOfWork;
  nextId: () => string;
  now: () => string;
};

export type UpdateNoteResult = {
  event: NoteUpdated;
  view: Note;
};

export const handleUpdateNote = (
  command: UpdateNoteCommand,
  deps: HandleUpdateNoteDeps
): ResultAsync<UpdateNoteResult, UpdateNoteError> => {
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

        const decision = decideUpdateNote({
          command,
          current: loaded,
          nextVersion: deps.backend.nextVersion(loaded.version),
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
          const work = noteWork({
            result: { event, view: plan.view },
            plan,
            event: toNoteIntegrationEvent({
              event,
              id: deps.nextId(),
              occurredAt,
              actor: command.actor,
            }),
          });
          return commitNote(deps.uow, work).orElse((failure) =>
            mapNoteCommitFailure(failure, command.noteId, () =>
              deps.backend.get({
                organizationId: command.organizationId,
                projectId: command.projectId,
                noteId: command.noteId,
              })
            )
          );
        });
      });
  });
};

import { errAsync, type ResultAsync } from 'neverthrow';
import type { Note } from '@yoink/api-contracts';
import type { UnitOfWork } from '../../../../kernel/unit-of-work.js';
import type { CreateNoteCommand } from '../../domain/messages/note-commands.js';
import type { NoteCreated } from '../../domain/messages/events.js';
import {
  projectNotFoundError,
  storageError,
  type CreateNoteError,
} from '../../domain/messages/note-errors.js';
import { decideCreateNote } from '../../domain/decisions/decide-create.js';
import { planNoteChange } from '../../domain/projections/plan-note-change.js';
import { toNoteIntegrationEvent } from '../integration-events/to-note-integration-event.js';
import type { LoadActorName, LoadProject, NotesBackend } from '../ports.js';
import { commitNote, noteWork } from '../support/commit-note.js';

export type HandleCreateNoteDeps = {
  backend: NotesBackend;
  loadProject: LoadProject;
  loadActorName: LoadActorName;
  uow: UnitOfWork;
  nextId: () => string;
  now: () => string;
};

export type CreateNoteResult = {
  event: NoteCreated;
  view: Note;
};

export const handleCreateNote = (
  command: CreateNoteCommand,
  deps: HandleCreateNoteDeps
): ResultAsync<CreateNoteResult, CreateNoteError> => {
  return deps.loadProject(command.projectId).andThen((project) => {
    if (!project || project.organizationId !== command.organizationId) {
      return errAsync(projectNotFoundError(command.projectId));
    }

    const now = deps.now();
    const decision = decideCreateNote({
      command,
      id: deps.nextId(),
      now,
    });
    if (decision.isErr()) {
      return errAsync(decision.error);
    }

    return deps.loadActorName(command.actor.userId).andThen((actorName) => {
      const event = decision.value;
      const plan = planNoteChange({
        event,
        current: null,
        actor: command.actor,
        actorName,
      });
      const occurredAt = deps.now();
      return commitNote(
        deps.uow,
        noteWork({
          result: { event, view: plan.view },
          plan,
          event: toNoteIntegrationEvent({
            event,
            id: deps.nextId(),
            occurredAt,
            actor: command.actor,
          }),
        })
      ).mapErr((failure) =>
        storageError(
          failure.kind === 'Conflict'
            ? 'Unexpected stale note on create'
            : 'Failed to persist note change',
          failure
        )
      );
    });
  });
};

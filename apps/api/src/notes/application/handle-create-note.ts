import { errAsync, type ResultAsync } from 'neverthrow';
import type { Note } from '@yoink/api-contracts';
import type { CreateNoteCommand } from '../domain/note-commands.js';
import type { NoteCreated } from '../domain/events.js';
import {
  projectNotFoundError,
  storageError,
  type CreateNoteError,
} from '../domain/note-errors.js';
import { decideCreateNote } from '../domain/decide-create.js';
import { planNoteChange } from '../domain/plan-note-change.js';
import type { LoadActorName, LoadProject, NotesBackend } from './ports.js';

export type HandleCreateNoteDeps = {
  backend: NotesBackend;
  loadProject: LoadProject;
  loadActorName: LoadActorName;
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
        ids: { recordId: deps.nextId() },
      });
      return deps.backend.persist(plan).mapErr((error) =>
        error.type === 'STALE_NOTE' ? storageError('Unexpected stale note on create') : error
      ).map(() => ({
        event,
        view: plan.view,
      }));
    });
  });
};

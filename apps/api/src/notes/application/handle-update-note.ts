import { errAsync, type ResultAsync } from 'neverthrow';
import type { Note } from '@yoink/api-contracts';
import type { UpdateNoteCommand } from '../domain/note-commands.js';
import type { NoteUpdated } from '../domain/events.js';
import {
  noteNotFoundError,
  projectNotFoundError,
  type UpdateNoteError,
} from '../domain/note-errors.js';
import { decideUpdateNote } from '../domain/decide-update.js';
import { planNoteChange } from '../domain/plan-note-change.js';
import type { LoadActorName, LoadProject, NotesBackend } from './ports.js';

export type HandleUpdateNoteDeps = {
  backend: NotesBackend;
  loadProject: LoadProject;
  loadActorName: LoadActorName;
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
            ids: { recordId: deps.nextId() },
          });
          return deps.backend.persist(plan).map(() => ({
            event,
            view: plan.view,
          }));
        });
      });
  });
};

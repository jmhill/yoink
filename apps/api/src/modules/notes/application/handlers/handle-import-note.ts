import { errAsync, okAsync, type ResultAsync } from 'neverthrow';
import type { Note } from '@yoink/api-contracts';
import type { UnitOfWork } from '../../../../kernel/unit-of-work.js';
import type { ImportNoteFromObsidianCommand } from '../../domain/messages/note-commands.js';
import type { NoteCreated, NoteUpdated } from '../../domain/messages/events.js';
import {
  noteImportRequiresBotError,
  noteImportRequiresMirrorBotError,
  noteNotFoundError,
  noteSyncConflictError,
  noteSyncNoPersonError,
  projectNotFoundError,
  storageError,
  type ImportNoteError,
} from '../../domain/messages/note-errors.js';
import { isDesignatedMirrorBot } from '../../domain/rules/mirror-bot.js';
import { decideImportNote } from '../../domain/decisions/decide-import.js';
import { planNoteChange } from '../../domain/projections/plan-note-change.js';
import { toNoteIntegrationEvent } from '../integration-events/to-note-integration-event.js';
import type { LoadNotesMirrorBot, LoadOrgPerson, LoadProject, NotesBackend } from '../ports.js';
import { commitNote, noteWork } from '../support/commit-note.js';

export type HandleImportNoteDeps = {
  backend: NotesBackend;
  loadProject: LoadProject;
  loadOrgPerson: LoadOrgPerson;
  loadNotesMirrorBot: LoadNotesMirrorBot;
  uow: UnitOfWork;
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

  return deps.loadNotesMirrorBot(command.organizationId).andThen((designatedUserId) => {
    if (!isDesignatedMirrorBot({ actorUserId: command.actor.userId, designatedUserId })) {
      return errAsync(noteImportRequiresMirrorBotError());
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
          const plan =
            event.type === 'NoteCreated'
              ? planNoteChange({
                  event,
                  current: null,
                  actor: author,
                  actorName: person.name,
                })
              : loaded
                ? planNoteChange({
                    event,
                    current: loaded,
                    actor: author,
                    actorName: person.name,
                  })
                : null;
          if (plan === null) {
            return errAsync(noteNotFoundError(command.noteId ?? event.id));
          }
          const occurredAt = deps.now();
          return commitNote(
            deps.uow,
            noteWork({
              result: {
                event,
                view: plan.view,
                created: event.type === 'NoteCreated',
              },
              plan,
              event: toNoteIntegrationEvent({
                event,
                id: deps.nextId(),
                occurredAt,
                actor: author,
              }),
            })
          ).orElse((failure) => {
            if (failure.kind !== 'Conflict' || failure.reason !== 'stale-note') {
              return errAsync(storageError('Failed to persist note change', failure));
            }
            return deps.backend
              .get({
                organizationId: command.organizationId,
                projectId: command.projectId,
                noteId: plan.view.id,
              })
              .andThen((current) =>
                current
                  ? errAsync(
                      noteSyncConflictError({
                        version: current.version,
                        title: current.title,
                        body: current.body,
                        updatedAt: current.updatedAt,
                        updatedById: current.updatedById,
                        updatedByName: current.updatedByName,
                      })
                    )
                  : errAsync(noteNotFoundError(plan.view.id))
              );
          });
        });
      });
    });
  });
};

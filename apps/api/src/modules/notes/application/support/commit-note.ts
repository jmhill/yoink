import { errAsync, type ResultAsync } from 'neverthrow';
import type { CommitFailure, UnitOfWork, Work } from '../../../../kernel/unit-of-work.js';
import type { NoteIntegrationEvent } from '../integration-events/to-note-integration-event.js';
import type { NoteChangePlan } from '../../domain/projections/plan-note-change.js';
import {
  noteNotFoundError,
  staleNoteError,
  storageError,
  type NoteNotFoundError,
  type StaleNoteError,
  type StorageError,
} from '../../domain/messages/note-errors.js';
import type { Note } from '@yoink/api-contracts';

export const noteWork = <T>(input: {
  result: T;
  plan: NoteChangePlan;
  event: NoteIntegrationEvent;
}): Work<T> => ({
  result: input.result,
  events: [input.event],
  step: { owner: 'notes', plan: input.plan },
});

export const commitNote = <T>(
  uow: UnitOfWork,
  work: Work<T>
): ResultAsync<T, CommitFailure> => uow.commit([work]).map(() => work.result);

export const mapNoteCommitFailure = (
  failure: CommitFailure,
  noteId: string,
  reload: () => ResultAsync<Note | null, StorageError>
): ResultAsync<never, StorageError | StaleNoteError | NoteNotFoundError> => {
  if (failure.kind === 'Conflict' && failure.reason === 'stale-note') {
    return reload().andThen((loaded) =>
      loaded
        ? errAsync(
            staleNoteError({
              version: loaded.version,
              updatedAt: loaded.updatedAt,
              updatedById: loaded.updatedById,
              updatedByName: loaded.updatedByName,
            })
          )
        : errAsync(storageError('Note disappeared during update'))
    );
  }
  if (failure.kind === 'Conflict' && failure.reason === 'note-missing') {
    return errAsync(noteNotFoundError(noteId));
  }
  return errAsync(storageError('Failed to persist note change', failure));
};

import { errAsync, okAsync, type ResultAsync } from 'neverthrow';
import type { Note, NoteListItem } from '@yoink/api-contracts';
import type { KeysetCursor } from '../../listing/domain/keyset-cursor.js';
import type { KeysetRows } from '../../listing/domain/listed-page.js';
import {
  staleNoteError,
  type StaleNoteError,
  type StorageError,
} from '../domain/note-errors.js';
import { nextBuiltInNoteVersion } from '../domain/parse-note-fields.js';
import { toNoteListItem } from '../domain/apply-note-event.js';
import type { NoteChangePlan } from '../domain/plan-note-change.js';
import type { NotesBackend } from '../application/ports.js';

type StoredNote = Note & { deletedAt: string | null };

const byRecency = (left: StoredNote, right: StoredNote): number => {
  if (left.updatedAt !== right.updatedAt) {
    return right.updatedAt < left.updatedAt ? -1 : 1;
  }
  return right.id < left.id ? -1 : 1;
};

const visible = (notes: readonly StoredNote[], organizationId: string, projectId: string) =>
  notes.filter(
    (note) =>
      note.organizationId === organizationId &&
      note.projectId === projectId &&
      note.deletedAt === null
  );

const pageNotes = (
  rows: readonly NoteListItem[],
  fetchLimit: number,
  seek?: KeysetCursor
): KeysetRows<NoteListItem> => {
  const after =
    seek && seek.view === 'notes.project'
      ? rows.filter((note) => {
          const [updatedAt, id] = seek.keys;
          return (
            note.updatedAt < updatedAt || (note.updatedAt === updatedAt && note.id < id)
          );
        })
      : rows;
  return {
    rows: after.slice(0, fetchLimit),
    total: rows.length,
  };
};

export const createFakeNotesBackend = (initial: Note[] = []): NotesBackend => {
  let notes: readonly StoredNote[] = initial.map((note) => ({
    ...note,
    deletedAt: null,
  }));

  const persist = (
    plan: NoteChangePlan
  ): ResultAsync<void, StorageError | StaleNoteError> => {
    if (plan.action === 'insert') {
      notes = [...notes, { ...plan.view, deletedAt: null }];
      return okAsync(undefined);
    }

    const current = notes.find(
      (note) =>
        note.id === plan.noteId &&
        note.organizationId === plan.organizationId &&
        note.projectId === plan.projectId
    );
    if (!current || current.deletedAt !== null) {
      return errAsync({
        type: 'STORAGE_ERROR',
        message: 'Note not found',
      });
    }

    if (plan.action === 'delete') {
      notes = notes.map((note) =>
        note.id === current.id ? { ...current, deletedAt: plan.deletedAt } : note
      );
      return okAsync(undefined);
    }

    if (current.version !== plan.expectedVersion) {
      return errAsync(
        staleNoteError({
          version: current.version,
          updatedAt: current.updatedAt,
          updatedById: current.updatedById,
          updatedByName: current.updatedByName,
        })
      );
    }

    notes = notes.map((note) =>
      note.id === current.id ? { ...plan.view, deletedAt: null } : note
    );
    return okAsync(undefined);
  };

  return {
    nextVersion: nextBuiltInNoteVersion,
    list: (options) => {
      const items = visible(notes, options.organizationId, options.projectId)
        .slice()
        .sort(byRecency)
        .map(toNoteListItem);
      return okAsync(pageNotes(items, options.fetchLimit, options.seek));
    },
    get: (input) =>
      okAsync(
        visible(notes, input.organizationId, input.projectId).find(
          (note) => note.id === input.noteId
        ) ?? null
      ),
    persist,
  };
};

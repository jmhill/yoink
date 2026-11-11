import { err, ok, okAsync, type Result } from 'neverthrow';
import type { Note, NoteListItem } from '../../domain/model/note.js';
import type { KeysetCursor } from '../../../../kernel/listing/domain/keyset-cursor.js';
import type { KeysetRows } from '../../../../kernel/listing/domain/listed-page.js';
import type { StepFailure } from '../../../../kernel/unit-of-work.js';
import type { NoteChangeRow } from '../../domain/model/note-change-row.js';
import { nextBuiltInNoteVersion } from '../../domain/rules/parse-note-fields.js';
import { toNoteListItem } from '../../domain/projections/apply-note-event.js';
import type { NoteChangePlan } from '../../domain/projections/plan-note-change.js';
import type { NotesBackend } from '../../application/ports.js';

type StoredNote = Note & { deletedAt: string | null };

const byRecency = (left: StoredNote, right: StoredNote): number => {
  if (left.updatedAt !== right.updatedAt) {
    return right.updatedAt < left.updatedAt ? -1 : 1;
  }
  return right.id < left.id ? -1 : 1;
};

const byOldestChange = (left: StoredNote, right: StoredNote): number => {
  if (left.updatedAt !== right.updatedAt) {
    return left.updatedAt < right.updatedAt ? -1 : 1;
  }
  return left.id < right.id ? -1 : 1;
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

export type FakeNotesStore = NotesBackend & {
  snapshot: () => () => void;
  apply: (plan: unknown) => Result<void, StepFailure>;
};

const conflict = (reason: string): Result<void, StepFailure> =>
  err({ kind: 'Conflict', owner: 'notes', reason });

export const createFakeNotesBackend = (
  initial: Note[] = [],
  options: { projectNameOf?: (projectId: string) => string } = {}
): FakeNotesStore => {
  let notes: readonly StoredNote[] = initial.map((note) => ({
    ...note,
    deletedAt: null,
  }));

  const apply = (plan: unknown): Result<void, StepFailure> => {
    if (typeof plan !== 'object' || plan === null || !('action' in plan)) {
      return err({ kind: 'Storage', owner: 'notes', owners: ['notes'], reason: 'plan-rejected' });
    }
    const change = plan as NoteChangePlan;
    if (change.action === 'insert') {
      notes = [...notes, { ...change.view, deletedAt: null }];
      return ok(undefined);
    }

    const organizationId =
      change.action === 'update' ? change.view.organizationId : change.organizationId;
    const projectId = change.action === 'update' ? change.view.projectId : change.projectId;
    const current = notes.find(
      (note) =>
        note.id === change.noteId &&
        note.organizationId === organizationId &&
        note.projectId === projectId
    );
    if (!current || current.deletedAt !== null) {
      return conflict('note-missing');
    }

    if (change.action === 'delete') {
      notes = notes.map((note) =>
        note.id === current.id
          ? { ...current, deletedAt: change.deletedAt, updatedAt: change.deletedAt }
          : note
      );
      return ok(undefined);
    }

    if (current.version !== change.expectedVersion) {
      return conflict('stale-note');
    }

    notes = notes.map((note) =>
      note.id === current.id ? { ...change.view, deletedAt: null } : note
    );
    return ok(undefined);
  };

  return {
    snapshot: () => {
      const copy = notes;
      return () => {
        notes = copy;
      };
    },
    apply,
    nextVersion: nextBuiltInNoteVersion,
    list: (listOptions) => {
      const items = visible(notes, listOptions.organizationId, listOptions.projectId)
        .slice()
        .sort(byRecency)
        .map(toNoteListItem);
      return okAsync(pageNotes(items, listOptions.fetchLimit, listOptions.seek));
    },
    listChangedSince: (changeOptions) => {
      const matching = notes
        .filter(
          (note) =>
            note.organizationId === changeOptions.organizationId &&
            note.updatedAt >= changeOptions.since
        )
        .slice()
        .sort(byOldestChange);
      const afterSeek = matching.filter((note) => {
        if (!changeOptions.seek || changeOptions.seek.view !== 'notes.changed') {
          return true;
        }
        const [updatedAt, id] = changeOptions.seek.keys;
        return note.updatedAt > updatedAt || (note.updatedAt === updatedAt && note.id > id);
      });
      const rows: NoteChangeRow[] = afterSeek.slice(0, changeOptions.fetchLimit).map((note) => ({
        id: note.id,
        organizationId: note.organizationId,
        projectId: note.projectId,
        projectName: options.projectNameOf?.(note.projectId) ?? 'Project',
        title: note.title,
        body: note.body,
        version: note.version,
        createdAt: note.createdAt,
        createdById: note.createdById,
        createdByName: note.createdByName,
        updatedAt: note.updatedAt,
        updatedById: note.updatedById,
        updatedByName: note.updatedByName,
        deletedAt: note.deletedAt,
      }));
      return okAsync({ rows, total: matching.length });
    },
    get: (input) =>
      okAsync(
        visible(notes, input.organizationId, input.projectId).find(
          (note) => note.id === input.noteId
        ) ?? null
      ),
  };
};

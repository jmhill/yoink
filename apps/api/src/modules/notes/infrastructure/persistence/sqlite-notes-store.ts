import { errAsync, okAsync, Result, ResultAsync } from 'neverthrow';
import type { Note } from '../../domain/model/note.js';
import type { Database } from '../../../../platform/database/types.js';
import { pageSqlite } from '../../../../platform/sql/page-sqlite.js';
import { notesChangedDirection, projectNotesDirection } from '../../../../kernel/listing/domain/list-keys.js';
import { storageError, type StorageError } from '../../domain/messages/note-errors.js';
import { nextBuiltInNoteVersion } from '../../domain/rules/parse-note-fields.js';
import { toNoteListItem } from '../../domain/projections/apply-note-event.js';
import type { NoteChangeRow } from '../../domain/model/note-change-row.js';
import type { LoadNoteActors, LoadProject, NotesBackend } from '../../application/ports.js';
import { parseNoteChangeRow, parseNoteRow } from './rows/parse-note-row.js';
import {
  NOTE_CHANGE_FROM,
  NOTE_CHANGE_SELECT_COLUMNS,
  NOTE_FROM,
  NOTE_SELECT_COLUMNS,
} from './rows/note-row-statements.js';

const displayName = (name: string | null | undefined, email: string | null | undefined): string =>
  name ?? email ?? 'Unknown';

export type SqliteNotesStoreDeps = {
  loadNoteActors: LoadNoteActors;
  loadProject: LoadProject;
};

const parseNotes = (rows: Record<string, unknown>[]): Result<Note[], StorageError> =>
  Result.combine(rows.map(parseNoteRow));

const parseNoteChanges = (rows: Record<string, unknown>[]): Result<NoteChangeRow[], StorageError> =>
  Result.combine(rows.map(parseNoteChangeRow));

const nameOf = (
  actors: ReadonlyMap<string, string>,
  userId: string
): string => actors.get(userId) ?? 'Unknown';

const actorNames = (
  deps: SqliteNotesStoreDeps,
  ids: readonly string[]
): ResultAsync<ReadonlyMap<string, string>, StorageError> =>
  deps.loadNoteActors([...new Set(ids)]).map(
    (loaded) =>
      new Map(loaded.map((actor) => [actor.id, displayName(actor.name, actor.email)]))
  );

const withNoteNames = (
  deps: SqliteNotesStoreDeps,
  notes: readonly Note[]
): ResultAsync<Note[], StorageError> =>
  actorNames(
    deps,
    notes.flatMap((note) => [note.createdById, note.updatedById])
  ).map((names) =>
    notes.map((note) => ({
      ...note,
      createdByName: nameOf(names, note.createdById),
      updatedByName: nameOf(names, note.updatedById),
    }))
  );

const withChangeNames = (
  deps: SqliteNotesStoreDeps,
  rows: readonly NoteChangeRow[]
): ResultAsync<NoteChangeRow[], StorageError> => {
  const projectIds = [...new Set(rows.map((row) => row.projectId))];
  return actorNames(
    deps,
    rows.flatMap((row) => [row.createdById, row.updatedById])
  ).andThen((names) =>
    ResultAsync.combine(
      projectIds.map((id) =>
        deps.loadProject(id).map((project) => [id, project?.name ?? 'Project'] as const)
      )
    ).map((pairs) => {
      const projectNames = new Map(pairs);
      return rows.map((row) => ({
        ...row,
        projectName: projectNames.get(row.projectId) || row.projectName,
        createdByName: nameOf(names, row.createdById),
        updatedByName: nameOf(names, row.updatedById),
      }));
    })
  );
};

export const createSqliteNotesStore = (
  db: Database,
  deps: SqliteNotesStoreDeps
): NotesBackend => ({
  nextVersion: nextBuiltInNoteVersion,

  list: (options) =>
    pageSqlite({
      db,
      from: NOTE_FROM,
      selectSql: `SELECT ${NOTE_SELECT_COLUMNS}`,
      whereSql: 'n.organization_id = ? AND n.project_id = ? AND n.deleted_at IS NULL',
      whereArgs: [options.organizationId, options.projectId],
      orderSql: 'ORDER BY n.updated_at DESC, n.id DESC',
      keyColumns: ['n.updated_at', 'n.id'],
      direction: projectNotesDirection,
      fetchLimit: options.fetchLimit,
      seek: options.seek,
      mapRow: (row) => row,
      errorMessage: 'Failed to list notes',
    }).andThen((page) => {
      const parsed = parseNotes(page.rows);
      if (parsed.isErr()) {
        return errAsync(parsed.error);
      }
      return withNoteNames(deps, parsed.value).map((notes) => ({
        rows: notes.map(toNoteListItem),
        total: page.total,
      }));
    }),

  listChangedSince: (options) =>
    pageSqlite({
      db,
      from: NOTE_CHANGE_FROM,
      selectSql: `SELECT ${NOTE_CHANGE_SELECT_COLUMNS}`,
      whereSql: 'n.organization_id = ? AND n.updated_at >= ?',
      whereArgs: [options.organizationId, options.since],
      orderSql: 'ORDER BY n.updated_at ASC, n.id ASC',
      keyColumns: ['n.updated_at', 'n.id'],
      direction: notesChangedDirection,
      fetchLimit: options.fetchLimit,
      seek: options.seek,
      mapRow: (row) => row,
      errorMessage: 'Failed to list notes changed since',
    }).andThen((page) => {
      const parsed = parseNoteChanges(page.rows);
      if (parsed.isErr()) {
        return errAsync(parsed.error);
      }
      return withChangeNames(deps, parsed.value).map((rows) => ({
        rows,
        total: page.total,
      }));
    }),

  get: (input) =>
    ResultAsync.fromPromise(
      db.execute({
        sql: `
          SELECT ${NOTE_SELECT_COLUMNS}
          FROM ${NOTE_FROM}
          WHERE n.id = ? AND n.organization_id = ? AND n.project_id = ?
            AND n.deleted_at IS NULL
        `,
        args: [input.noteId, input.organizationId, input.projectId],
      }),
      (cause) => storageError('Failed to load note', cause)
    ).andThen((result) => {
      const row = result.rows[0];
      if (!row) {
        return okAsync(null);
      }
      const parsed = parseNoteRow(row);
      if (parsed.isErr()) {
        return errAsync(parsed.error);
      }
      return withNoteNames(deps, [parsed.value]).map((notes) => notes[0] ?? null);
    }),
});

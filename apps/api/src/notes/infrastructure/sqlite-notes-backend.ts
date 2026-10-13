import { errAsync, okAsync, Result, ResultAsync } from 'neverthrow';
import type { Note, NoteListItem } from '@yoink/api-contracts';
import type { Database } from '../../database/types.js';
import { pageSqlite } from '../../listing/infrastructure/page-sqlite.js';
import { projectNotesDirection } from '../../listing/domain/list-keys.js';
import {
  insertChangeLogIfChangedQuery,
  insertChangeLogQuery,
} from '../../shared/change-log/infrastructure/sql.js';
import { staleNoteError, storageError, type StorageError } from '../domain/note-errors.js';
import { nextBuiltInNoteVersion } from '../domain/parse-note-fields.js';
import type { NotesBackend } from '../application/ports.js';
import { parseNoteChangeRow, parseNoteListItemRow, parseNoteRow } from './parse-note-row.js';
import {
  deleteNoteQuery,
  insertNoteQuery,
  NOTE_CHANGE_FROM,
  NOTE_CHANGE_SELECT_COLUMNS,
  NOTE_FROM,
  NOTE_SELECT_COLUMNS,
  updateNoteQuery,
} from './note-row-statements.js';
import { notesChangedDirection } from '../../listing/domain/list-keys.js';
import type { NoteChangeRow } from '../domain/note-change-row.js';

const parseNotes = (rows: Record<string, unknown>[]): Result<NoteListItem[], StorageError> =>
  Result.combine(rows.map(parseNoteListItemRow));

const parseNoteChanges = (rows: Record<string, unknown>[]): Result<NoteChangeRow[], StorageError> =>
  Result.combine(rows.map(parseNoteChangeRow));

const loadNote = (
  db: Database,
  input: { organizationId: string; projectId: string; noteId: string }
): ResultAsync<Note | null, StorageError> =>
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
    return parsed.isOk() ? okAsync(parsed.value) : errAsync(parsed.error);
  });

const persistFailure = (error: unknown): StorageError =>
  storageError('Failed to persist note change', error);

export const createSqliteNotesBackend = (db: Database): NotesBackend => ({
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
      return parsed.isOk()
        ? okAsync({ rows: parsed.value, total: page.total })
        : errAsync(parsed.error);
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
      return parsed.isOk()
        ? okAsync({ rows: parsed.value, total: page.total })
        : errAsync(parsed.error);
    }),

  get: (input) => loadNote(db, input),

  persist: (plan) => {
    if (plan.action === 'insert') {
      const queries = [
        insertNoteQuery(plan.view),
        ...plan.records.map((record) => insertChangeLogQuery(record)),
      ];
      return ResultAsync.fromPromise(
        db.batch(queries, 'write'),
        persistFailure
      ).map(() => undefined);
    }

    if (plan.action === 'delete') {
      const queries = [
        deleteNoteQuery({
          noteId: plan.noteId,
          organizationId: plan.organizationId,
          projectId: plan.projectId,
          deletedAt: plan.deletedAt,
          updatedById: plan.updatedById,
        }),
        ...plan.records.map((record) => insertChangeLogIfChangedQuery(record)),
      ];
      return ResultAsync.fromPromise(
        db.batch(queries, 'write'),
        persistFailure
      ).map(() => undefined);
    }

    const queries = [
      updateNoteQuery({ note: plan.view, expectedVersion: plan.expectedVersion }),
      ...plan.records.map((record) => insertChangeLogIfChangedQuery(record)),
    ];
    return ResultAsync.fromPromise(
      db.batch(queries, 'write'),
      persistFailure
    ).andThen((results) => {
      if ((results[0]?.rowsAffected ?? 0) > 0) {
        return okAsync(undefined);
      }
      return loadNote(db, {
        organizationId: plan.organizationId,
        projectId: plan.projectId,
        noteId: plan.noteId,
      }).andThen((loaded) =>
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
    });
  },
});

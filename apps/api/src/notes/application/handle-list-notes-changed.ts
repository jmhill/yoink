import type { NoteChange, NoteChangePage } from '@yoink/api-contracts';
import type { ResultAsync } from 'neverthrow';
import type { ListNotesChangedQuery } from '../domain/note-queries.js';
import type { ListNotesChangedError } from '../domain/note-errors.js';
import type { NoteChangeRow } from '../domain/note-change-row.js';
import { resolveListLimit } from '../../listing/domain/list-kind.js';
import { notesChangedCursor } from '../../listing/domain/list-keys.js';
import { runListedQuery } from '../../listing/application/run-listed-query.js';
import type { NotesBackend } from './ports.js';

export type HandleListNotesChangedDeps = {
  backend: NotesBackend;
};

const toChange = (row: NoteChangeRow): NoteChange => {
  if (row.deletedAt !== null) {
    return {
      kind: 'deleted',
      id: row.id,
      projectId: row.projectId,
      projectName: row.projectName,
      createdAt: row.createdAt,
      deletedAt: row.deletedAt,
    };
  }
  return {
    kind: 'upserted',
    id: row.id,
    organizationId: row.organizationId,
    projectId: row.projectId,
    projectName: row.projectName,
    title: row.title,
    body: row.body,
    version: row.version,
    createdAt: row.createdAt,
    createdById: row.createdById,
    createdByName: row.createdByName,
    updatedAt: row.updatedAt,
    updatedById: row.updatedById,
    updatedByName: row.updatedByName,
  };
};

export const handleListNotesChanged = (
  query: ListNotesChangedQuery,
  deps: HandleListNotesChangedDeps
): ResultAsync<NoteChangePage, ListNotesChangedError> =>
  runListedQuery({
    cursor: query.cursor,
    cursorOf: notesChangedCursor,
    limit: resolveListLimit(query.limit, 'pile'),
    load: (seek, fetchLimit) =>
      deps.backend.listChangedSince({
        organizationId: query.organizationId,
        since: query.since,
        fetchLimit,
        seek,
      }),
  }).map((page) => ({
    changes: page.items.map(toChange),
    hasMore: page.hasMore,
    nextCursor: page.nextCursor,
    total: page.total,
  }));

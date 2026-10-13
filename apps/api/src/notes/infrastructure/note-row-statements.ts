import type { Note } from '@yoink/api-contracts';
import type { SqlQuery } from '../../shared/change-log/infrastructure/sql.js';

export const NOTE_SELECT_COLUMNS = `
  n.id, n.organization_id, n.project_id, n.title, n.body, n.version,
  n.created_at, n.created_by, n.updated_at, n.updated_by,
  created.name AS created_by_name, created.email AS created_by_email,
  updated.name AS updated_by_name, updated.email AS updated_by_email
`;

export const NOTE_FROM = `
  project_notes n
  LEFT JOIN users created ON created.id = n.created_by
  LEFT JOIN users updated ON updated.id = n.updated_by
`;

export const NOTE_CHANGE_SELECT_COLUMNS = `
  ${NOTE_SELECT_COLUMNS},
  n.deleted_at,
  p.name AS project_name
`;

export const NOTE_CHANGE_FROM = `
  project_notes n
  LEFT JOIN users created ON created.id = n.created_by
  LEFT JOIN users updated ON updated.id = n.updated_by
  JOIN projects p ON p.id = n.project_id
`;

export const insertNoteQuery = (note: Note): SqlQuery => ({
  sql: `
    INSERT INTO project_notes (
      id, organization_id, project_id, title, body, version,
      created_at, created_by, updated_at, updated_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
  args: [
    note.id,
    note.organizationId,
    note.projectId,
    note.title,
    note.body,
    note.version,
    note.createdAt,
    note.createdById,
    note.updatedAt,
    note.updatedById,
  ],
});

export const updateNoteQuery = (input: {
  note: Note;
  expectedVersion: string;
}): SqlQuery => ({
  sql: `
    UPDATE project_notes
    SET title = ?, body = ?, version = ?, updated_at = ?, updated_by = ?
    WHERE id = ? AND organization_id = ? AND project_id = ?
      AND version = ? AND deleted_at IS NULL
  `,
  args: [
    input.note.title,
    input.note.body,
    input.note.version,
    input.note.updatedAt,
    input.note.updatedById,
    input.note.id,
    input.note.organizationId,
    input.note.projectId,
    input.expectedVersion,
  ],
});

export const deleteNoteQuery = (input: {
  noteId: string;
  organizationId: string;
  projectId: string;
  deletedAt: string;
  updatedById: string;
}): SqlQuery => ({
  sql: `
    UPDATE project_notes
    SET deleted_at = ?, updated_at = ?, updated_by = ?
    WHERE id = ? AND organization_id = ? AND project_id = ? AND deleted_at IS NULL
  `,
  args: [
    input.deletedAt,
    input.deletedAt,
    input.updatedById,
    input.noteId,
    input.organizationId,
    input.projectId,
  ],
});

/**
 * Note documents. The module owns these shapes. Edges map them onto
 * contract types. Field order matches the contract schemas.
 */

export const NOTE_TITLE_MAX_LENGTH = 120;
export const NOTE_BODY_MAX_LENGTH = 50_000;
export const NOTE_COPY_SUFFIX = ' (copy)';

export type Note = {
  id: string;
  organizationId: string;
  projectId: string;
  title: string;
  body: string;
  version: string;
  createdAt: string;
  createdById: string;
  createdByName: string;
  updatedAt: string;
  updatedById: string;
  updatedByName: string;
};

export type NoteListItem = {
  id: string;
  organizationId: string;
  projectId: string;
  title: string;
  excerpt: string;
  version: string;
  createdAt: string;
  createdById: string;
  createdByName: string;
  updatedAt: string;
  updatedById: string;
  updatedByName: string;
};

export type NoteUpsertedChange = Note & {
  kind: 'upserted';
  projectName: string;
};

export type NoteDeletedChange = {
  kind: 'deleted';
  id: string;
  projectId: string;
  projectName: string;
  createdAt: string;
  deletedAt: string;
};

export type NoteChange = NoteUpsertedChange | NoteDeletedChange;

export type NoteChangePage = {
  changes: NoteChange[];
  hasMore: boolean;
  nextCursor: string | null;
  total: number;
};

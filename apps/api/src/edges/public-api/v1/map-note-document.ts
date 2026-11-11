import type {
  Note as ContractNote,
  NoteChange as ContractNoteChange,
  NoteChangePage as ContractNoteChangePage,
  NoteListItem as ContractNoteListItem,
} from '@yoink/api-contracts';
import type {
  Note,
  NoteChange,
  NoteChangePage,
  NoteListItem,
} from '../../../modules/notes/index.js';

/** Copy a note document onto the contract note, in schema field order. */
export const toContractNote = (note: Note): ContractNote => ({
  id: note.id,
  organizationId: note.organizationId,
  projectId: note.projectId,
  title: note.title,
  body: note.body,
  version: note.version,
  createdAt: note.createdAt,
  createdById: note.createdById,
  createdByName: note.createdByName,
  updatedAt: note.updatedAt,
  updatedById: note.updatedById,
  updatedByName: note.updatedByName,
});

/** Copy a list row onto the contract list item, in schema field order. */
export const toContractNoteListItem = (item: NoteListItem): ContractNoteListItem => ({
  id: item.id,
  organizationId: item.organizationId,
  projectId: item.projectId,
  title: item.title,
  excerpt: item.excerpt,
  version: item.version,
  createdAt: item.createdAt,
  createdById: item.createdById,
  createdByName: item.createdByName,
  updatedAt: item.updatedAt,
  updatedById: item.updatedById,
  updatedByName: item.updatedByName,
});

/**
 * Copy a sync change onto the contract change, in the key order the
 * query already returns.
 */
export const toContractNoteChange = (change: NoteChange): ContractNoteChange => {
  if (change.kind === 'deleted') {
    return {
      kind: 'deleted',
      id: change.id,
      projectId: change.projectId,
      projectName: change.projectName,
      createdAt: change.createdAt,
      deletedAt: change.deletedAt,
    };
  }
  return {
    kind: 'upserted',
    id: change.id,
    organizationId: change.organizationId,
    projectId: change.projectId,
    projectName: change.projectName,
    title: change.title,
    body: change.body,
    version: change.version,
    createdAt: change.createdAt,
    createdById: change.createdById,
    createdByName: change.createdByName,
    updatedAt: change.updatedAt,
    updatedById: change.updatedById,
    updatedByName: change.updatedByName,
  };
};

export const toContractNoteChangePage = (page: NoteChangePage): ContractNoteChangePage => ({
  changes: page.changes.map(toContractNoteChange),
  hasMore: page.hasMore,
  nextCursor: page.nextCursor,
  total: page.total,
});

import type { ZodTypeAny } from 'zod';
import { describe, expect, it } from 'vitest';
import { publicApiV1Contract } from '@yoink/api-contracts/public-api/v1';
import type { Note, NoteListItem } from '../../../modules/notes/index.js';
import { toContractNote, toContractNoteListItem } from './map-note-document.js';
import { toNoteListBody } from '../../_shared/http-listed-page.js';

const outputSchema = (procedure: { '~orpc': { outputSchemas?: readonly unknown[] } }): ZodTypeAny => {
  const schema = procedure['~orpc'].outputSchemas?.[0];
  if (schema === undefined) {
    throw new Error('missing frozen output schema');
  }
  return schema as ZodTypeAny;
};

const note: Note = {
  id: '550e8400-e29b-41d4-a716-446655440010',
  organizationId: '550e8400-e29b-41d4-a716-446655440011',
  projectId: '550e8400-e29b-41d4-a716-446655440012',
  title: 'Meeting notes',
  body: 'First line',
  version: '1',
  createdAt: '2026-10-12T18:00:00.000Z',
  createdById: '550e8400-e29b-41d4-a716-446655440013',
  createdByName: 'Lane',
  updatedAt: '2026-10-12T18:00:00.000Z',
  updatedById: '550e8400-e29b-41d4-a716-446655440013',
  updatedByName: 'Lane',
};

const listItem: NoteListItem = {
  id: note.id,
  organizationId: note.organizationId,
  projectId: note.projectId,
  title: note.title,
  excerpt: 'First line',
  version: note.version,
  createdAt: note.createdAt,
  createdById: note.createdById,
  createdByName: note.createdByName,
  updatedAt: note.updatedAt,
  updatedById: note.updatedById,
  updatedByName: note.updatedByName,
};

describe('public API note mapping', () => {
  it('maps a create command view onto the frozen note body', () => {
    const body = toContractNote(note);
    const schema = outputSchema(publicApiV1Contract.notes.create);
    const parsed = schema.parse(body);
    expect(parsed).toEqual(body);
    expect(Object.keys(body)).toEqual(Object.keys(parsed));
  });

  it('maps a list query page onto the frozen note list body', () => {
    const item = toContractNoteListItem(listItem);
    const body = toNoteListBody({
      items: [item],
      hasMore: false,
      nextCursor: null,
      total: 1,
    });
    const schema = outputSchema(publicApiV1Contract.notes.list);
    expect(schema.parse(body)).toEqual({
      hasMore: false,
      nextCursor: null,
      total: 1,
      notes: [item],
    });
  });
});

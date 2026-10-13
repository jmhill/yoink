import { describe, it, expect } from 'vitest';
import {
  CreateNoteSchema,
  NOTE_BODY_MAX_LENGTH,
  NOTE_TITLE_MAX_LENGTH,
  NoteListPageSchema,
  NoteSchema,
  UpdateNoteSchema,
} from './note.js';

const note = {
  id: '11111111-1111-4111-8111-111111111111',
  organizationId: '22222222-2222-4222-8222-222222222222',
  projectId: '33333333-3333-4333-8333-333333333333',
  title: 'Meeting notes',
  body: 'First line\n\nMore',
  version: '1',
  createdAt: '2026-10-12T18:00:00.000Z',
  createdById: '44444444-4444-4444-8444-444444444444',
  createdByName: 'Lane',
  updatedAt: '2026-10-12T18:05:00.000Z',
  updatedById: '44444444-4444-4444-8444-444444444444',
  updatedByName: 'Lane',
};

describe('note contract', () => {
  it('accepts a full note with created and last-change times', () => {
    expect(NoteSchema.safeParse(note).success).toBe(true);
  });

  it('treats version as an opaque string', () => {
    expect(NoteSchema.safeParse({ ...note, version: 'obsidian:mtime:1' }).success).toBe(
      true
    );
  });

  it('caps title at 120 and body at 50_000', () => {
    expect(NOTE_TITLE_MAX_LENGTH).toBe(120);
    expect(NOTE_BODY_MAX_LENGTH).toBe(50_000);
    expect(CreateNoteSchema.safeParse({ title: 'x'.repeat(121) }).success).toBe(false);
    expect(CreateNoteSchema.safeParse({ title: 'Ok', body: 'x'.repeat(50_001) }).success).toBe(
      false
    );
    expect(CreateNoteSchema.safeParse({ title: 'Ok', body: '' }).success).toBe(true);
  });

  it('requires expectedVersion and a field on update', () => {
    expect(UpdateNoteSchema.safeParse({ expectedVersion: '1' }).success).toBe(false);
    expect(
      UpdateNoteSchema.safeParse({ title: 'Renamed', expectedVersion: '1' }).success
    ).toBe(true);
  });

  it('pages notes like Work', () => {
    const parsed = NoteListPageSchema.safeParse({
      notes: [],
      hasMore: false,
      nextCursor: null,
      total: 0,
    });
    expect(parsed.success).toBe(true);
  });
});

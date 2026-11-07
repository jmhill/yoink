import { describe, it, expect } from 'vitest';
import type { TimelineEntry } from '@yoink/api-contracts';
import { combineNoteTimelineEntries } from './combine-note-timeline.js';

const noteEntry = (
  kind: 'NoteCreated' | 'NoteUpdated' | 'NoteDeleted',
  occurredAt: string,
  noteId = 'note-1',
  userId = 'user-1'
): TimelineEntry => ({
  id: `${kind}-${occurredAt}`,
  kind,
  occurredAt,
  actor: { userId, kind: 'user', name: 'Lane' },
  subject: { type: 'note', id: noteId, title: 'Meeting notes', deleted: false },
  details:
    kind === 'NoteUpdated'
      ? { kind, title: 'Meeting notes', titleChanged: false, bodyChanged: true }
      : { kind, title: 'Meeting notes' },
});

describe('combineNoteTimelineEntries', () => {
  it('keeps one entry when the same person saves the same note within 10 minutes', () => {
    const newer = noteEntry('NoteUpdated', '2026-10-12T18:08:00.000Z');
    const older = noteEntry('NoteCreated', '2026-10-12T18:00:00.000Z');
    expect(combineNoteTimelineEntries([newer, older])).toEqual([newer]);
  });

  it('keeps both when saves are more than 10 minutes apart', () => {
    const newer = noteEntry('NoteUpdated', '2026-10-12T18:15:00.000Z');
    const older = noteEntry('NoteCreated', '2026-10-12T18:00:00.000Z');
    expect(combineNoteTimelineEntries([newer, older])).toEqual([newer, older]);
  });

  it('does not combine a delete or another person', () => {
    const deleted = noteEntry('NoteDeleted', '2026-10-12T18:05:00.000Z');
    const created = noteEntry('NoteCreated', '2026-10-12T18:00:00.000Z');
    const other = noteEntry('NoteUpdated', '2026-10-12T18:04:00.000Z', 'note-1', 'user-2');
    expect(combineNoteTimelineEntries([deleted, other, created])).toEqual([
      deleted,
      other,
      created,
    ]);
  });
});

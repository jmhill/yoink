import { describe, it, expect } from 'vitest';
import { formatNoteListStamp } from './format-note-list-line.js';

describe('formatNoteListStamp', () => {
  it('shows the date and who last edited', () => {
    expect(
      formatNoteListStamp({
        updatedAt: '2026-10-12T18:12:00.000Z',
        updatedByName: 'Lane',
        now: new Date('2026-10-12T20:00:00.000Z'),
      })
    ).toBe('Oct 12 · Lane');
  });
});

import { describe, expect, it } from 'vitest';
import {
  taskPlaceFromBoard,
  taskPlaceHeading,
  taskPlaceSubcopy,
} from './task-place';

const groceriesId = '00000000-0000-0000-0000-000000000010';

describe('taskPlaceFromBoard', () => {
  it('names smart views from the filter when there is no pile', () => {
    expect(taskPlaceFromBoard({ pile: null, filter: 'today' })).toEqual({ kind: 'today' });
    expect(taskPlaceFromBoard({ pile: null, filter: 'upcoming' })).toEqual({
      kind: 'upcoming',
    });
    expect(taskPlaceFromBoard({ pile: null, filter: 'mine' })).toEqual({ kind: 'mine' });
    expect(taskPlaceFromBoard({ pile: null, filter: 'completed' })).toEqual({ kind: 'done' });
  });

  it('treats omitted filter as Today (tasks board landing)', () => {
    expect(taskPlaceFromBoard({ pile: null, filter: 'today' }).kind).toBe('today');
    expect(taskPlaceFromBoard({ pile: null, filter: '' })).toEqual({ kind: 'today' });
  });

  it('uses the named list or Unlisted over any leftover filter', () => {
    expect(
      taskPlaceFromBoard({
        pile: { kind: 'named', listId: groceriesId },
        filter: 'today',
        namedListName: 'Groceries',
      })
    ).toEqual({ kind: 'named', name: 'Groceries' });
    expect(
      taskPlaceFromBoard({ pile: { kind: 'unlisted' }, filter: 'upcoming' })
    ).toEqual({ kind: 'unlisted' });
  });

  it('falls back to List when the named pile name is not loaded', () => {
    expect(
      taskPlaceFromBoard({
        pile: { kind: 'named', listId: groceriesId },
        filter: 'today',
      })
    ).toEqual({ kind: 'named', name: 'List' });
  });
});

describe('task place heading', () => {
  it('reads the current place name at a glance', () => {
    expect(taskPlaceHeading({ kind: 'today' })).toBe('Today');
    expect(taskPlaceHeading({ kind: 'upcoming' })).toBe('Upcoming');
    expect(taskPlaceHeading({ kind: 'mine' })).toBe('Mine');
    expect(taskPlaceHeading({ kind: 'done' })).toBe('Done');
    expect(taskPlaceHeading({ kind: 'unlisted' })).toBe('Unlisted');
    expect(taskPlaceHeading({ kind: 'named', name: 'Groceries' })).toBe('Groceries');
  });

  it('uses a short count cue — not Inbox triage copy', () => {
    expect(taskPlaceSubcopy({ kind: 'today' }, 0)).toBe('0 open');
    expect(taskPlaceSubcopy({ kind: 'today' }, 2)).toBe('2 open');
    expect(taskPlaceSubcopy({ kind: 'unlisted' }, 1)).toBe('1 open');
    expect(taskPlaceSubcopy({ kind: 'named', name: 'Groceries' }, 3)).toBe('3 open');
    expect(taskPlaceSubcopy({ kind: 'upcoming' }, 4)).toBe('4 open');
    expect(taskPlaceSubcopy({ kind: 'mine' }, 1)).toBe('1 assigned');
    expect(taskPlaceSubcopy({ kind: 'done' }, 5)).toBe('5 completed');
    expect(taskPlaceSubcopy({ kind: 'today' }, 2)).not.toMatch(/to process|references & triage/i);
  });
});

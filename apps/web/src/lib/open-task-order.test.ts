import { describe, expect, it } from 'vitest';
import {
  dropIndexForClientY,
  moveOpenTaskId,
  openTaskIds,
  openTaskOrderChanged,
} from './open-task-order';

describe('openTaskIds', () => {
  it('lists ids in the given open order', () => {
    expect(
      openTaskIds([{ id: 'milk' }, { id: 'eggs' }, { id: 'bread' }])
    ).toEqual(['milk', 'eggs', 'bread']);
  });
});

describe('openTaskOrderChanged', () => {
  it('is false when the sequence is unchanged', () => {
    expect(openTaskOrderChanged(['a', 'b', 'c'], ['a', 'b', 'c'])).toBe(false);
  });

  it('is true when open tasks are rearranged', () => {
    expect(openTaskOrderChanged(['a', 'b', 'c'], ['b', 'a', 'c'])).toBe(true);
  });

  it('is false when the sets differ in length (do not persist a partial pile)', () => {
    expect(openTaskOrderChanged(['a', 'b', 'c'], ['b', 'a'])).toBe(false);
    expect(openTaskOrderChanged([], ['a'])).toBe(false);
  });
});

describe('moveOpenTaskId', () => {
  it('moves an id to another index', () => {
    expect(moveOpenTaskId({ ids: ['a', 'b', 'c'], fromIndex: 0, toIndex: 1 })).toEqual([
      'b',
      'a',
      'c',
    ]);
    expect(moveOpenTaskId({ ids: ['a', 'b', 'c'], fromIndex: 2, toIndex: 0 })).toEqual([
      'c',
      'a',
      'b',
    ]);
  });

  it('returns a copy when the index does not change', () => {
    const ids = ['a', 'b'];
    expect(moveOpenTaskId({ ids, fromIndex: 0, toIndex: 0 })).toEqual(['a', 'b']);
    expect(moveOpenTaskId({ ids, fromIndex: 0, toIndex: 0 })).not.toBe(ids);
  });
});

describe('dropIndexForClientY', () => {
  it('picks the last midpoint the pointer has crossed', () => {
    expect(dropIndexForClientY({ clientY: 10, mids: [20, 60, 100] })).toBe(0);
    expect(dropIndexForClientY({ clientY: 60, mids: [20, 60, 100] })).toBe(1);
    expect(dropIndexForClientY({ clientY: 120, mids: [20, 60, 100] })).toBe(2);
  });
});

import { describe, expect, it } from 'vitest';
import { openTaskIds, openTaskOrderChanged } from './open-task-order';

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

import { describe, expect, it } from 'vitest';
import {
  draggedStridePx,
  dropIndexForClientY,
  insertionLineOffsetPx,
  moveOpenTaskId,
  neighborShiftPx,
  openTaskIds,
  openTaskOrderChanged,
  orderOpenTasksAfterDragMove,
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

describe('orderOpenTasksAfterDragMove', () => {
  const slotMids = [40, 120, 200, 280];
  const ids = ['milk', 'eggs', 'bread', 'butter'];

  it('moves the last open task to first from one pointer sample on the top slot', () => {
    expect(
      orderOpenTasksAfterDragMove({
        ids,
        fromIndex: 3,
        clientY: 40,
        slotMids,
      })
    ).toEqual(['butter', 'milk', 'eggs', 'bread']);
  });

  it('moves the first open task to last from one pointer sample on the bottom slot', () => {
    expect(
      orderOpenTasksAfterDragMove({
        ids,
        fromIndex: 0,
        clientY: 280,
        slotMids,
      })
    ).toEqual(['eggs', 'bread', 'butter', 'milk']);
  });

  it('still does a one-slot neighbor move', () => {
    expect(
      orderOpenTasksAfterDragMove({
        ids,
        fromIndex: 0,
        clientY: 120,
        slotMids,
      })
    ).toEqual(['eggs', 'milk', 'bread', 'butter']);
  });

  it('keeps the same ids when the pointer stays on the dragged row’s slot', () => {
    expect(
      orderOpenTasksAfterDragMove({
        ids: ['milk', 'eggs', 'bread'],
        fromIndex: 1,
        clientY: 90,
        slotMids: [40, 90, 160],
      })
    ).toEqual(['milk', 'eggs', 'bread']);
  });

  it('crosses many slots across a continuous gesture without resetting origin', () => {
    let next = ids;
    for (const clientY of [220, 140, 60, 40]) {
      next = orderOpenTasksAfterDragMove({
        ids,
        fromIndex: 3,
        clientY,
        slotMids,
      });
    }
    expect(next).toEqual(['butter', 'milk', 'eggs', 'bread']);
  });
});

describe('neighborShiftPx', () => {
  it('slides neighbors up when dragging down so a gap opens at the drop', () => {
    expect(
      neighborShiftPx({ index: 1, fromIndex: 0, dropIndex: 2, draggedStride: 80 })
    ).toBe(-80);
    expect(
      neighborShiftPx({ index: 2, fromIndex: 0, dropIndex: 2, draggedStride: 80 })
    ).toBe(-80);
    expect(
      neighborShiftPx({ index: 0, fromIndex: 0, dropIndex: 2, draggedStride: 80 })
    ).toBe(0);
  });

  it('slides neighbors down when dragging up so a gap opens at the drop', () => {
    expect(
      neighborShiftPx({ index: 0, fromIndex: 2, dropIndex: 0, draggedStride: 80 })
    ).toBe(80);
    expect(
      neighborShiftPx({ index: 1, fromIndex: 2, dropIndex: 0, draggedStride: 80 })
    ).toBe(80);
    expect(
      neighborShiftPx({ index: 2, fromIndex: 2, dropIndex: 0, draggedStride: 80 })
    ).toBe(0);
  });

  it('does not shift anyone when the pointer stays on the origin slot', () => {
    expect(
      neighborShiftPx({ index: 1, fromIndex: 1, dropIndex: 1, draggedStride: 80 })
    ).toBe(0);
  });
});

describe('insertionLineOffsetPx', () => {
  it('places the line at the drop slot relative to the list', () => {
    expect(
      insertionLineOffsetPx({ dropIndex: 2, slotTops: [100, 180, 260], listTop: 100 })
    ).toBe(160);
  });
});

describe('draggedStridePx', () => {
  it('uses the distance to the next slot when there is one', () => {
    expect(
      draggedStridePx({
        fromIndex: 0,
        slotTops: [0, 88, 176],
        slotHeights: [80, 80, 80],
      })
    ).toBe(88);
  });

  it('uses the last row height when dragging the last item', () => {
    expect(
      draggedStridePx({
        fromIndex: 2,
        slotTops: [0, 88, 176],
        slotHeights: [80, 80, 80],
      })
    ).toBe(80);
  });
});

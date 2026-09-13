import { describe, expect, it } from 'vitest';
import {
  NAMED_LIST_OVERFLOW_MENU_GAP,
  NAMED_LIST_OVERFLOW_MENU_HEIGHT,
  NAMED_LIST_OVERFLOW_MENU_WIDTH,
  namedListOverflowMenuCoords,
} from './named-list-overflow-menu';

const box = (left: number, top: number, width: number, height: number) => ({
  left,
  top,
  width,
  height,
  right: left + width,
  bottom: top + height,
});

describe('namedListOverflowMenuCoords', () => {
  it('opens to the right of the trigger when the container has room', () => {
    const trigger = box(140, 200, 32, 32);
    const container = box(0, 0, 1280, 720);

    expect(namedListOverflowMenuCoords({ trigger, container })).toEqual({
      left: 140 + 32 + NAMED_LIST_OVERFLOW_MENU_GAP,
      top: 200 + 32 + NAMED_LIST_OVERFLOW_MENU_GAP,
    });
  });

  it('keeps the menu on-screen when the trigger sits at the desktop rail edge', () => {
    const trigger = box(152, 400, 32, 32);
    const container = box(0, 0, 192, 720);

    expect(namedListOverflowMenuCoords({ trigger, container })).toEqual({
      left: Math.max(8, 192 - NAMED_LIST_OVERFLOW_MENU_WIDTH - 8),
      top: 400 + 32 + NAMED_LIST_OVERFLOW_MENU_GAP,
    });
  });

  it('flips above the trigger when there is no room below', () => {
    const trigger = box(40, 680, 32, 32);
    const container = box(0, 0, 1280, 720);

    expect(namedListOverflowMenuCoords({ trigger, container })).toEqual({
      left: 40 + 32 + NAMED_LIST_OVERFLOW_MENU_GAP,
      top: 680 - NAMED_LIST_OVERFLOW_MENU_GAP - NAMED_LIST_OVERFLOW_MENU_HEIGHT,
    });
  });
});

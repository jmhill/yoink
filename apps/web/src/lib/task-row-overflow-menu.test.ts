import { describe, expect, it } from 'vitest';
import {
  TASK_ROW_OVERFLOW_MENU_GAP,
  TASK_ROW_OVERFLOW_MENU_HEIGHT,
  TASK_ROW_OVERFLOW_MENU_WIDTH,
  taskRowOverflowMenuCoords,
} from './task-row-overflow-menu';

const box = (left: number, top: number, width: number, height: number) => ({
  left,
  top,
  width,
  height,
  right: left + width,
  bottom: top + height,
});

describe('taskRowOverflowMenuCoords', () => {
  it('opens below the trigger, right-aligned, when the viewport has room', () => {
    const trigger = box(1000, 200, 44, 44);
    const viewport = box(0, 0, 1280, 720);

    expect(taskRowOverflowMenuCoords({ trigger, viewport })).toEqual({
      left: 1000 + 44 - TASK_ROW_OVERFLOW_MENU_WIDTH,
      top: 200 + 44 + TASK_ROW_OVERFLOW_MENU_GAP,
    });
  });

  it('keeps the menu on-screen when the trigger sits at the right edge', () => {
    const trigger = box(1240, 200, 32, 32);
    const viewport = box(0, 0, 1280, 720);

    expect(taskRowOverflowMenuCoords({ trigger, viewport })).toEqual({
      left: Math.max(8, 1280 - TASK_ROW_OVERFLOW_MENU_WIDTH - 8),
      top: 200 + 32 + TASK_ROW_OVERFLOW_MENU_GAP,
    });
  });

  it('flips above the trigger when there is no room below', () => {
    const trigger = box(1000, 680, 44, 44);
    const viewport = box(0, 0, 1280, 720);

    expect(taskRowOverflowMenuCoords({ trigger, viewport })).toEqual({
      left: 1000 + 44 - TASK_ROW_OVERFLOW_MENU_WIDTH,
      top: 680 - TASK_ROW_OVERFLOW_MENU_GAP - TASK_ROW_OVERFLOW_MENU_HEIGHT,
    });
  });

  it('clamps above-flip to the viewport when the trigger is at the top', () => {
    const trigger = box(100, 4, 44, 44);
    const viewport = box(0, 0, 1280, 80);

    expect(taskRowOverflowMenuCoords({ trigger, viewport }).top).toBe(8);
  });
});

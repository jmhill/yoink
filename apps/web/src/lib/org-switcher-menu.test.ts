import { describe, expect, it } from 'vitest';
import {
  ORG_SWITCHER_MENU_GAP,
  ORG_SWITCHER_MENU_ITEM_HEIGHT,
  ORG_SWITCHER_MENU_PADDING,
  ORG_SWITCHER_MENU_WIDTH,
  orgSwitcherMenuCoords,
  orgSwitcherMenuHeight,
} from './org-switcher-menu';

const box = (left: number, top: number, width: number, height: number) => ({
  left,
  top,
  width,
  height,
  right: left + width,
  bottom: top + height,
});

describe('orgSwitcherMenuHeight', () => {
  it('counts padding plus one row per org', () => {
    expect(orgSwitcherMenuHeight(2)).toBe(
      ORG_SWITCHER_MENU_PADDING + 2 * ORG_SWITCHER_MENU_ITEM_HEIGHT
    );
  });

  it('treats an empty list as one row so the menu still has a box', () => {
    expect(orgSwitcherMenuHeight(0)).toBe(
      ORG_SWITCHER_MENU_PADDING + ORG_SWITCHER_MENU_ITEM_HEIGHT
    );
  });
});

describe('orgSwitcherMenuCoords', () => {
  it('opens below the trigger, left-aligned, when the viewport has room', () => {
    const trigger = box(220, 16, 160, 32);
    const viewport = box(0, 0, 1280, 720);

    expect(orgSwitcherMenuCoords({ trigger, viewport, itemCount: 2 })).toEqual({
      left: 220,
      top: 16 + 32 + ORG_SWITCHER_MENU_GAP,
    });
  });

  it('keeps the menu on-screen when the trigger sits at the right edge', () => {
    const trigger = box(1200, 16, 72, 32);
    const viewport = box(0, 0, 1280, 720);

    expect(orgSwitcherMenuCoords({ trigger, viewport, itemCount: 2 })).toEqual({
      left: Math.max(8, 1280 - ORG_SWITCHER_MENU_WIDTH - 8),
      top: 16 + 32 + ORG_SWITCHER_MENU_GAP,
    });
  });

  it('flips above the trigger when there is no room below', () => {
    const trigger = box(220, 680, 160, 32);
    const viewport = box(0, 0, 1280, 720);
    const menuHeight = orgSwitcherMenuHeight(3);

    expect(orgSwitcherMenuCoords({ trigger, viewport, itemCount: 3 })).toEqual({
      left: 220,
      top: 680 - ORG_SWITCHER_MENU_GAP - menuHeight,
    });
  });

  it('clamps above-flip to the viewport when the trigger is at the top of a short window', () => {
    const trigger = box(220, 4, 160, 32);
    const viewport = box(0, 0, 1280, 80);

    expect(orgSwitcherMenuCoords({ trigger, viewport, itemCount: 2 }).top).toBe(8);
  });
});

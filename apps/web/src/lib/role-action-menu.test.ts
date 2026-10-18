import { describe, expect, it } from 'vitest';
import {
  ROLE_ACTION_MENU_GAP,
  ROLE_ACTION_MENU_HEIGHT,
  ROLE_ACTION_MENU_WIDTH,
  roleActionMenuCoords,
} from './role-action-menu';

describe('roleActionMenuCoords', () => {
  const viewport = {
    top: 0,
    left: 0,
    right: 1280,
    bottom: 720,
    width: 1280,
    height: 720,
  };

  it('places the menu below and end-aligned when there is room', () => {
    const trigger = {
      top: 200,
      left: 900,
      right: 1020,
      bottom: 236,
      width: 120,
      height: 36,
    };
    expect(roleActionMenuCoords({ trigger, viewport })).toEqual({
      top: trigger.bottom + ROLE_ACTION_MENU_GAP,
      left: trigger.right - ROLE_ACTION_MENU_WIDTH,
    });
  });

  it('flips above the trigger when it would run off the bottom', () => {
    const trigger = {
      top: 690,
      left: 900,
      right: 1020,
      bottom: 720,
      width: 120,
      height: 30,
    };
    expect(roleActionMenuCoords({ trigger, viewport })).toEqual({
      top: trigger.top - ROLE_ACTION_MENU_GAP - ROLE_ACTION_MENU_HEIGHT,
      left: trigger.right - ROLE_ACTION_MENU_WIDTH,
    });
  });
});

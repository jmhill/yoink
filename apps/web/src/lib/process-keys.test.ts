import { describe, expect, it } from 'vitest';
import { isTypingTarget, processKeyAction, shouldListenForProcessKeys } from './process-keys';

const keyEvent = (key: string, target?: EventTarget | null): KeyboardEvent => {
  const event = new KeyboardEvent('keydown', { key });
  if (target) {
    Object.defineProperty(event, 'target', { value: target });
  }
  return event;
};

describe('shouldListenForProcessKeys', () => {
  const active = {
    desktop: true,
    hasCurrent: true,
    sheetOpen: false,
    pathname: '/process',
  };

  it('listens only on the desktop Process page', () => {
    expect(shouldListenForProcessKeys(active)).toBe(true);
    expect(shouldListenForProcessKeys({ ...active, pathname: '/tasks' })).toBe(false);
    expect(shouldListenForProcessKeys({ ...active, pathname: '/' })).toBe(false);
    expect(shouldListenForProcessKeys({ ...active, desktop: false })).toBe(false);
    expect(shouldListenForProcessKeys({ ...active, hasCurrent: false })).toBe(false);
    expect(shouldListenForProcessKeys({ ...active, sheetOpen: true })).toBe(false);
  });
});

describe('processKeyAction', () => {
  it('maps T P S Z, Delete, and Backspace', () => {
    expect(processKeyAction(keyEvent('t'))).toBe('make-task');
    expect(processKeyAction(keyEvent('P'))).toBe('new-project');
    expect(processKeyAction(keyEvent('s'))).toBe('someday-project');
    expect(processKeyAction(keyEvent('Z'))).toBe('snooze');
    expect(processKeyAction(keyEvent('Delete'))).toBe('trash');
    expect(processKeyAction(keyEvent('Backspace'))).toBe('trash');
  });

  it('ignores key-repeat so a held Delete cannot trash two captures', () => {
    const held = new KeyboardEvent('keydown', { key: 'Delete', repeat: true });
    expect(processKeyAction(held)).toBeNull();
  });

  it('ignores chords and unknown keys', () => {
    const chord = new KeyboardEvent('keydown', { key: 't', metaKey: true });
    expect(processKeyAction(chord)).toBeNull();
    expect(processKeyAction(keyEvent('Enter'))).toBeNull();
  });

  it('ignores keys while typing', () => {
    const input = document.createElement('input');
    expect(isTypingTarget(input)).toBe(true);
    expect(processKeyAction(keyEvent('t', input))).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import { isTypingTarget, processKeyAction } from './process-keys';

const keyEvent = (key: string, target?: EventTarget | null): KeyboardEvent => {
  const event = new KeyboardEvent('keydown', { key });
  if (target) {
    Object.defineProperty(event, 'target', { value: target });
  }
  return event;
};

describe('processKeyAction', () => {
  it('maps T P S Z and Delete', () => {
    expect(processKeyAction(keyEvent('t'))).toBe('make-task');
    expect(processKeyAction(keyEvent('P'))).toBe('new-project');
    expect(processKeyAction(keyEvent('s'))).toBe('someday-project');
    expect(processKeyAction(keyEvent('Z'))).toBe('snooze');
    expect(processKeyAction(keyEvent('Delete'))).toBe('trash');
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

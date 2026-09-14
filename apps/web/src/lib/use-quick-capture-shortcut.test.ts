import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useQuickCaptureShortcut } from './use-quick-capture-shortcut';

const dispatchChord = (target: EventTarget, init: KeyboardEventInit) => {
  target.dispatchEvent(
    new KeyboardEvent('keydown', {
      key: 'k',
      bubbles: true,
      cancelable: true,
      ...init,
    })
  );
};

afterEach(() => {
  document.body.innerHTML = '';
});

describe('useQuickCaptureShortcut', () => {
  it('routes Ctrl+K on desktop when focus is not in a field', () => {
    const onTrigger = vi.fn();
    renderHook(() => useQuickCaptureShortcut({ enabled: true, onTrigger }));

    dispatchChord(window, { ctrlKey: true });

    expect(onTrigger).toHaveBeenCalledTimes(1);
  });

  it('does nothing when disabled (mobile)', () => {
    const onTrigger = vi.fn();
    renderHook(() => useQuickCaptureShortcut({ enabled: false, onTrigger }));

    dispatchChord(window, { ctrlKey: true });

    expect(onTrigger).not.toHaveBeenCalled();
  });

  it('does not route while typing in another input', () => {
    const onTrigger = vi.fn();
    renderHook(() => useQuickCaptureShortcut({ enabled: true, onTrigger }));

    const input = document.createElement('input');
    document.body.append(input);
    input.focus();
    dispatchChord(input, { ctrlKey: true });

    expect(onTrigger).not.toHaveBeenCalled();
  });
});

import { afterEach, describe, expect, it } from 'vitest';
import {
  consumeQuickCaptureFocus,
  isEditableTarget,
  isInsideModal,
  isQuickCaptureInput,
  isQuickCaptureShortcut,
  quickCaptureShortcutHintLabel,
  requestQuickCaptureFocus,
  resetQuickCaptureFocusForTests,
  shouldRouteQuickCaptureShortcut,
} from './quick-capture-shortcut';

afterEach(() => {
  resetQuickCaptureFocusForTests();
  document.body.innerHTML = '';
});

describe('isQuickCaptureShortcut', () => {
  it('matches ⌘K and Ctrl+K, not other chords', () => {
    expect(
      isQuickCaptureShortcut({
        key: 'k',
        metaKey: true,
        ctrlKey: false,
        altKey: false,
        shiftKey: false,
      })
    ).toBe(true);
    expect(
      isQuickCaptureShortcut({
        key: 'K',
        metaKey: false,
        ctrlKey: true,
        altKey: false,
        shiftKey: false,
      })
    ).toBe(true);
    expect(
      isQuickCaptureShortcut({
        key: 'k',
        metaKey: false,
        ctrlKey: false,
        altKey: false,
        shiftKey: false,
      })
    ).toBe(false);
    expect(
      isQuickCaptureShortcut({
        key: 'k',
        metaKey: true,
        ctrlKey: false,
        altKey: false,
        shiftKey: true,
      })
    ).toBe(false);
    expect(
      isQuickCaptureShortcut({
        key: 'e',
        metaKey: true,
        ctrlKey: false,
        altKey: false,
        shiftKey: false,
      })
    ).toBe(false);
  });
});

describe('shouldRouteQuickCaptureShortcut', () => {
  it('is desktop-only', () => {
    expect(shouldRouteQuickCaptureShortcut({ isDesktop: false, target: document.body })).toBe(
      false
    );
    expect(shouldRouteQuickCaptureShortcut({ isDesktop: true, target: document.body })).toBe(true);
  });

  it('does not steal focus from other inputs or dialogs', () => {
    const input = document.createElement('input');
    document.body.append(input);
    expect(isEditableTarget(input)).toBe(true);
    expect(shouldRouteQuickCaptureShortcut({ isDesktop: true, target: input })).toBe(false);

    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    const button = document.createElement('button');
    dialog.append(button);
    document.body.append(dialog);
    expect(isInsideModal(button)).toBe(true);
    expect(shouldRouteQuickCaptureShortcut({ isDesktop: true, target: button })).toBe(false);
  });

  it('still routes when the capture field itself is focused', () => {
    const input = document.createElement('input');
    input.setAttribute('data-quick-capture-input', '');
    document.body.append(input);
    expect(isQuickCaptureInput(input)).toBe(true);
    expect(shouldRouteQuickCaptureShortcut({ isDesktop: true, target: input })).toBe(true);
  });
});

describe('quickCaptureShortcutHintLabel', () => {
  it('shows ⌘K on Apple and Ctrl+K elsewhere', () => {
    expect(quickCaptureShortcutHintLabel('MacIntel')).toBe('⌘K');
    expect(quickCaptureShortcutHintLabel('iPhone')).toBe('⌘K');
    expect(quickCaptureShortcutHintLabel('Win32')).toBe('Ctrl+K');
    expect(quickCaptureShortcutHintLabel('Linux x86_64')).toBe('Ctrl+K');
  });
});

describe('quick capture pending focus', () => {
  it('hands a one-shot focus request to the Inbox field', () => {
    expect(consumeQuickCaptureFocus()).toBe(false);
    requestQuickCaptureFocus();
    expect(consumeQuickCaptureFocus()).toBe(true);
    expect(consumeQuickCaptureFocus()).toBe(false);
  });
});

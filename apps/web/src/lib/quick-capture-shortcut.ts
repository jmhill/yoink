export const QUICK_CAPTURE_INPUT_TEST_ID = 'quick-capture-input';
export const QUICK_CAPTURE_HINT_TEST_ID = 'quick-capture-shortcut-hint';
export const QUICK_CAPTURE_INPUT_ATTR = 'data-quick-capture-input';

let pendingFocus = false;

export function requestQuickCaptureFocus(): void {
  pendingFocus = true;
}

export function consumeQuickCaptureFocus(): boolean {
  const pending = pendingFocus;
  pendingFocus = false;
  return pending;
}

export function resetQuickCaptureFocusForTests(): void {
  pendingFocus = false;
}

export function isQuickCaptureShortcut(event: {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}): boolean {
  if (event.key !== 'k' && event.key !== 'K') {
    return false;
  }
  if (event.altKey || event.shiftKey) {
    return false;
  }
  return event.metaKey || event.ctrlKey;
}

export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  if (target.isContentEditable) {
    return true;
  }
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

export function isQuickCaptureInput(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) {
    return false;
  }
  return target.closest('[data-quick-capture-input]') !== null;
}

export function isInsideModal(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) {
    return false;
  }
  return (
    target.closest(
      '[role="dialog"], [role="alertdialog"], [data-slot="dialog-content"], [data-slot="sheet-content"]'
    ) !== null
  );
}

/**
 * Desktop only. Do not yank focus out of other fields or open dialogs.
 * The capture field itself may still receive the shortcut (select / stay).
 */
export function shouldRouteQuickCaptureShortcut(input: {
  isDesktop: boolean;
  target: EventTarget | null;
}): boolean {
  if (!input.isDesktop) {
    return false;
  }
  if (isInsideModal(input.target)) {
    return false;
  }
  if (isEditableTarget(input.target) && !isQuickCaptureInput(input.target)) {
    return false;
  }
  return true;
}

/**
 * Costume shows ⌘K. Linux / Windows get Ctrl+K — same chord, platform glyph.
 */
export function quickCaptureShortcutHintLabel(platform: string): string {
  return /Mac|iPhone|iPad|iPod/i.test(platform) ? '⌘K' : 'Ctrl+K';
}

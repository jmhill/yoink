export const CAPTURE_SNOOZE_MENU_WIDTH = 144;
export const CAPTURE_SNOOZE_MENU_GAP = 4;
/** Three options (Later today / Tomorrow / Next week) plus padding. */
export const CAPTURE_SNOOZE_MENU_HEIGHT = 120;

export type SnoozeMenuBox = {
  top: number;
  left: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
};

/**
 * Place the capture snooze menu in the viewport with position:fixed.
 * Kit DropdownMenu collision math used the swipe card’s overflow box and
 * parked Tomorrow off-screen; this clamps to the window so Playwright
 * (and thumbs) can always hit the items.
 */
export function captureSnoozeMenuCoords(input: {
  trigger: SnoozeMenuBox;
  viewport: SnoozeMenuBox;
}): { top: number; left: number } {
  const { trigger, viewport } = input;
  const left = Math.min(
    Math.max(8, trigger.right - CAPTURE_SNOOZE_MENU_WIDTH),
    Math.max(8, viewport.width - CAPTURE_SNOOZE_MENU_WIDTH - 8)
  );
  const below = trigger.bottom + CAPTURE_SNOOZE_MENU_GAP;
  const above = trigger.top - CAPTURE_SNOOZE_MENU_GAP - CAPTURE_SNOOZE_MENU_HEIGHT;
  const top =
    below + CAPTURE_SNOOZE_MENU_HEIGHT <= viewport.height - 8
      ? below
      : Math.max(8, above);
  return { top, left };
}

export const TASK_ROW_OVERFLOW_MENU_WIDTH = 128;
export const TASK_ROW_OVERFLOW_MENU_GAP = 4;
/** Edit + Delete rows plus padding. */
export const TASK_ROW_OVERFLOW_MENU_HEIGHT = 72;

export type OverflowBox = {
  top: number;
  left: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
};

/**
 * Place the task-row ⋯ menu in the viewport with position:fixed.
 * Kit DropdownMenu collision math uses the swipe card’s overflow box and
 * can park Edit/Delete off-screen; clamp to the window like capture snooze.
 */
export function taskRowOverflowMenuCoords(input: {
  trigger: OverflowBox;
  viewport: OverflowBox;
}): { top: number; left: number } {
  const { trigger, viewport } = input;
  const left = Math.min(
    Math.max(8, trigger.right - TASK_ROW_OVERFLOW_MENU_WIDTH),
    Math.max(8, viewport.width - TASK_ROW_OVERFLOW_MENU_WIDTH - 8)
  );
  const below = trigger.bottom + TASK_ROW_OVERFLOW_MENU_GAP;
  const above = trigger.top - TASK_ROW_OVERFLOW_MENU_GAP - TASK_ROW_OVERFLOW_MENU_HEIGHT;
  const top =
    below + TASK_ROW_OVERFLOW_MENU_HEIGHT <= viewport.height - 8
      ? below
      : Math.max(8, above);
  return { top, left };
}

export const NAMED_LIST_OVERFLOW_MENU_WIDTH = 128;
export const NAMED_LIST_OVERFLOW_MENU_GAP = 4;
export const NAMED_LIST_OVERFLOW_MENU_HEIGHT = 36;

export type OverflowBox = {
  top: number;
  left: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
};

/**
 * Place Delete to the right of ⋯, flipping above the trigger when it
 * would run off the container. Same math for the mobile drawer (coords
 * relative to the sheet) and the desktop rail (viewport / position:fixed).
 */
export function namedListOverflowMenuCoords(input: {
  trigger: OverflowBox;
  container: OverflowBox;
}): { top: number; left: number } {
  const { trigger, container } = input;
  const left = Math.min(
    trigger.right - container.left + NAMED_LIST_OVERFLOW_MENU_GAP,
    Math.max(8, container.width - NAMED_LIST_OVERFLOW_MENU_WIDTH - 8)
  );
  const below = trigger.bottom - container.top + NAMED_LIST_OVERFLOW_MENU_GAP;
  const above =
    trigger.top -
    container.top -
    NAMED_LIST_OVERFLOW_MENU_GAP -
    NAMED_LIST_OVERFLOW_MENU_HEIGHT;
  const top =
    below + NAMED_LIST_OVERFLOW_MENU_HEIGHT <= container.height - 8
      ? below
      : Math.max(8, above);
  return { top, left };
}

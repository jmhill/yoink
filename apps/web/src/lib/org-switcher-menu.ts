export const ORG_SWITCHER_MENU_WIDTH = 224;
export const ORG_SWITCHER_MENU_GAP = 4;
export const ORG_SWITCHER_MENU_ITEM_HEIGHT = 36;
export const ORG_SWITCHER_MENU_PADDING = 8;

export type OrgSwitcherBox = {
  top: number;
  left: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
};

export const orgSwitcherMenuHeight = (itemCount: number): number =>
  ORG_SWITCHER_MENU_PADDING + Math.max(itemCount, 1) * ORG_SWITCHER_MENU_ITEM_HEIGHT;

/**
 * Place the header org picker in the viewport with position:fixed.
 * Kit DropdownMenu shares z-50 with the desktop rail and Vaul overlay and
 * can clip or bury the list so the chevron reads as doing nothing — same
 * family as named-list overflow and capture snooze. Clamp to the window
 * so the items stay hittable.
 */
export function orgSwitcherMenuCoords(input: {
  trigger: OrgSwitcherBox;
  viewport: OrgSwitcherBox;
  itemCount: number;
}): { top: number; left: number } {
  const { trigger, viewport, itemCount } = input;
  const menuHeight = orgSwitcherMenuHeight(itemCount);
  const left = Math.min(
    Math.max(8, trigger.left),
    Math.max(8, viewport.width - ORG_SWITCHER_MENU_WIDTH - 8)
  );
  const below = trigger.bottom + ORG_SWITCHER_MENU_GAP;
  const above = trigger.top - ORG_SWITCHER_MENU_GAP - menuHeight;
  const top =
    below + menuHeight <= viewport.height - 8 ? below : Math.max(8, above);
  return { top, left };
}

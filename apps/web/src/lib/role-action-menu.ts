export const ROLE_ACTION_MENU_WIDTH = 128;
export const ROLE_ACTION_MENU_GAP = 4;
/** One kit menuitem plus the menu padding. */
export const ROLE_ACTION_MENU_HEIGHT = 40;

export type RoleMenuBox = {
  top: number;
  left: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
};

/**
 * Place the desktop role menu under the trigger, flipping above when it
 * would run off the viewport. Kit DropdownMenu collision math parks the
 * item outside Playwright's viewport on the Members card.
 */
export const roleActionMenuCoords = (input: {
  trigger: RoleMenuBox;
  viewport: RoleMenuBox;
}): { top: number; left: number } => {
  const { trigger, viewport } = input;
  const left = Math.min(
    Math.max(8, trigger.right - ROLE_ACTION_MENU_WIDTH),
    Math.max(8, viewport.width - ROLE_ACTION_MENU_WIDTH - 8)
  );
  const below = trigger.bottom + ROLE_ACTION_MENU_GAP;
  const above = trigger.top - ROLE_ACTION_MENU_GAP - ROLE_ACTION_MENU_HEIGHT;
  const top =
    below + ROLE_ACTION_MENU_HEIGHT <= viewport.height - 8
      ? below
      : Math.max(8, above);
  return { top, left };
};

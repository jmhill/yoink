export type OpenTaskSlotBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

/**
 * Frozen-midpoint drop used by one-pile reorder (`dropIndexForClientY`):
 * last slot whose mid the pointer has crossed. Title-line Y sits above
 * that mid, so title-to-title never lands on the next slot when dragging
 * down — PUT /tasks/order never fires.
 */
export function dropPointForOpenTaskSlot(
  from: OpenTaskSlotBox,
  to: OpenTaskSlotBox
): { x: number; y: number } {
  const fromMidY = from.y + from.height / 2;
  const toMidY = to.y + to.height / 2;
  return {
    x: to.x + to.width / 2,
    y: fromMidY < toMidY ? toMidY + 1 : toMidY,
  };
}

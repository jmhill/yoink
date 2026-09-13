/**
 * Open-task order helpers for one-pile drag reorder.
 * HTTP still only maps the existing taskIds list — no new domain field.
 */

export function openTaskIds(tasks: readonly { id: string }[]): string[] {
  return tasks.map((task) => task.id);
}

export function openTaskOrderChanged(
  before: readonly string[],
  after: readonly string[]
): boolean {
  if (before.length !== after.length || before.length === 0) {
    return false;
  }
  return before.some((id, index) => id !== after[index]);
}

export function moveOpenTaskId(params: {
  ids: readonly string[];
  fromIndex: number;
  toIndex: number;
}): string[] {
  const { ids, fromIndex, toIndex } = params;
  if (
    fromIndex === toIndex ||
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= ids.length ||
    toIndex >= ids.length
  ) {
    return [...ids];
  }
  const next = [...ids];
  const [removed] = next.splice(fromIndex, 1);
  if (!removed) {
    return [...ids];
  }
  next.splice(toIndex, 0, removed);
  return next;
}

/**
 * Which open-task index a vertical drop lands on, given item midpoints
 * from top to bottom.
 *
 * Snapshot these mids at drag start (untransformed). Live midpoints of
 * the dragged row follow the pointer and pin the drop to one neighbor.
 */
export function dropIndexForClientY(params: {
  clientY: number;
  mids: readonly number[];
}): number {
  if (params.mids.length === 0) {
    return 0;
  }
  let index = 0;
  for (let i = 0; i < params.mids.length; i++) {
    const mid = params.mids[i];
    if (mid !== undefined && params.clientY >= mid) {
      index = i;
    }
  }
  return index;
}

/**
 * Open order after one pointer sample on a continuous drag. `slotMids`
 * stay frozen for the gesture; do not reset the grab origin between calls.
 */
export function orderOpenTasksAfterDragMove(params: {
  ids: readonly string[];
  fromIndex: number;
  clientY: number;
  slotMids: readonly number[];
}): string[] {
  const toIndex = dropIndexForClientY({
    clientY: params.clientY,
    mids: params.slotMids,
  });
  return moveOpenTaskId({
    ids: params.ids,
    fromIndex: params.fromIndex,
    toIndex,
  });
}

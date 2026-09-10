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

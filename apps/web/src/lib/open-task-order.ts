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

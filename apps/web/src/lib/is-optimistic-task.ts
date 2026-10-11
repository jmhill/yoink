export function isOptimisticTask(task: { id: string }): boolean {
  return task.id.startsWith('temp-');
}

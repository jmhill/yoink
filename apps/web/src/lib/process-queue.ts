export type ProcessQueueCapture = {
  id: string;
  capturedAt: string;
};

export function compareProcessQueueCaptures(
  left: ProcessQueueCapture,
  right: ProcessQueueCapture
): number {
  const byTime = left.capturedAt.localeCompare(right.capturedAt);
  if (byTime !== 0) {
    return byTime;
  }
  return left.id.localeCompare(right.id);
}

export function sortProcessQueue<T extends ProcessQueueCapture>(
  captures: readonly T[]
): T[] {
  return captures.slice().sort(compareProcessQueueCaptures);
}

export function processQueueSubcopy(count: number): string {
  return `${count} to process`;
}

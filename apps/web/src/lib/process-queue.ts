export type ProcessQueueCapture = {
  id: string;
  capturedAt: string;
};

export type ProcessQueueItem<TCapture extends ProcessQueueCapture = ProcessQueueCapture> = {
  kind: 'capture';
  capture: TCapture;
};

export type ProcessQueue<TCapture extends ProcessQueueCapture = ProcessQueueCapture> = {
  current: ProcessQueueItem<TCapture> | null;
  left: number;
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

export function processQueue<TCapture extends ProcessQueueCapture>(
  captures: readonly TCapture[]
): ProcessQueue<TCapture> {
  const ordered = sortProcessQueue(captures);
  const first = ordered[0];
  if (first === undefined) {
    return { current: null, left: 0 };
  }
  return {
    current: { kind: 'capture', capture: first },
    left: ordered.length,
  };
}

export function processQueueSubcopy(left: number): string {
  return `${left} left`;
}

export function processEmptySnoozedCopy(snoozedCount: number): string | null {
  if (snoozedCount < 1) {
    return null;
  }
  return `${snoozedCount} snoozed will come back`;
}

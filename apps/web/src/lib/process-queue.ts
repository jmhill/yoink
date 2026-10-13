export type ProcessQueueCapture = {
  id: string;
  capturedAt: string;
};

export type ProcessQueueProposal = {
  id: string;
  createdAt: string;
};

export type ProcessQueueItem<
  TCapture extends ProcessQueueCapture = ProcessQueueCapture,
  TProposal extends ProcessQueueProposal = ProcessQueueProposal,
> =
  | { kind: 'capture'; capture: TCapture }
  | { kind: 'proposal'; project: TProposal };

export type ProcessQueue<
  TCapture extends ProcessQueueCapture = ProcessQueueCapture,
  TProposal extends ProcessQueueProposal = ProcessQueueProposal,
> = {
  current: ProcessQueueItem<TCapture, TProposal> | null;
  left: number;
};

type QueueSource<TCapture extends ProcessQueueCapture, TProposal extends ProcessQueueProposal> = {
  at: string;
  id: string;
  item: ProcessQueueItem<TCapture, TProposal>;
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

const compareSources = (left: { at: string; id: string }, right: { at: string; id: string }): number => {
  const byTime = left.at.localeCompare(right.at);
  if (byTime !== 0) {
    return byTime;
  }
  return left.id.localeCompare(right.id);
};

export function processQueue<
  TCapture extends ProcessQueueCapture,
  TProposal extends ProcessQueueProposal,
>(
  captures: readonly TCapture[],
  proposals: readonly TProposal[] = []
): ProcessQueue<TCapture, TProposal> {
  const sources: Array<QueueSource<TCapture, TProposal>> = [
    ...captures.map((capture) => ({
      at: capture.capturedAt,
      id: capture.id,
      item: { kind: 'capture' as const, capture },
    })),
    ...proposals.map((project) => ({
      at: project.createdAt,
      id: project.id,
      item: { kind: 'proposal' as const, project },
    })),
  ].toSorted(compareSources);

  const first = sources[0];
  if (first === undefined) {
    return { current: null, left: 0 };
  }
  return {
    current: first.item,
    left: sources.length,
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

export function processBadgeTotal(inboxCount: number, proposalCount: number): number {
  return inboxCount + proposalCount;
}

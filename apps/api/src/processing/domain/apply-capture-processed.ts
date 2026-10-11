import type { Capture } from '@yoink/api-contracts';

export type CaptureProcessedFact = {
  processedAt: string;
  processedToType: 'task' | 'project';
  processedToId: string;
};

export const applyCaptureProcessed = (
  current: Capture,
  fact: CaptureProcessedFact
): Capture => ({
  ...current,
  status: 'processed',
  processedAt: fact.processedAt,
  processedToType: fact.processedToType,
  processedToId: fact.processedToId,
});

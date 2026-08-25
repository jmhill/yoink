import type { Capture } from '@yoink/api-contracts';
import type { CaptureEvent } from '../domain/events.js';

export type WriteResult<E extends CaptureEvent = CaptureEvent> = {
  event: E | null;
  view: Capture;
};

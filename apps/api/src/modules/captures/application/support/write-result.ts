import type { Capture } from '../../domain/model/capture.js';
import type { CaptureEvent } from '../../domain/messages/events.js';

export type WriteResult<E extends CaptureEvent = CaptureEvent> = {
  event: E | null;
  view: Capture;
};

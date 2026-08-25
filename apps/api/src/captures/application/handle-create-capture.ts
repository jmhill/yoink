import type { ResultAsync } from 'neverthrow';
import type { Capture } from '@yoink/api-contracts';
import type { CreateCaptureCommand } from '../domain/capture-commands.js';
import type { CaptureCreated } from '../domain/events.js';
import type { CreateCaptureError } from '../domain/capture-errors.js';
import { decideCreateCapture } from '../domain/decide-create.js';
import { applyCaptureEvent } from '../domain/apply-capture-event.js';
import type { PersistCaptureEvent } from './ports.js';

export type HandleCreateCaptureDeps = {
  persist: PersistCaptureEvent;
  nextId: () => string;
  now: () => string;
};

export type CreateCaptureResult = {
  event: CaptureCreated;
  view: Capture;
};

export const handleCreateCapture = (
  command: CreateCaptureCommand,
  deps: HandleCreateCaptureDeps
): ResultAsync<CreateCaptureResult, CreateCaptureError> => {
  const event = decideCreateCapture({
    command,
    id: deps.nextId(),
    now: deps.now(),
  });

  return deps.persist({ event, current: null }).map(() => ({
    event,
    view: applyCaptureEvent(null, event),
  }));
};

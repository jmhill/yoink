import type { ResultAsync } from 'neverthrow';
import type { UpdateCaptureCommand } from '../domain/capture-commands.js';
import type { UpdateCaptureError } from '../domain/capture-errors.js';
import type { CaptureContentUpdated } from '../domain/events.js';
import { decideUpdateCapture } from '../domain/decide-update.js';
import { applyCaptureEvent } from '../domain/apply-capture-event.js';
import { loadOwnedCapture } from './load-owned-capture.js';
import type { LoadCapture, PersistCaptureEvent } from './ports.js';
import type { WriteResult } from './write-result.js';

export type HandleUpdateCaptureDeps = {
  load: LoadCapture;
  persist: PersistCaptureEvent;
};

export const handleUpdateCapture = (
  command: UpdateCaptureCommand,
  deps: HandleUpdateCaptureDeps
): ResultAsync<WriteResult<CaptureContentUpdated>, UpdateCaptureError> => {
  return loadOwnedCapture({
    id: command.id,
    organizationId: command.organizationId,
    load: deps.load,
  }).andThen((current) => {
    const event = decideUpdateCapture({ current, command });
    return deps.persist({ event, current }).map(() => ({
      event,
      view: applyCaptureEvent(current, event),
    }));
  });
};

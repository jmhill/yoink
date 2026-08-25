import { okAsync, type ResultAsync } from 'neverthrow';
import type { RestoreCaptureCommand } from '../domain/capture-commands.js';
import type { RestoreCaptureError } from '../domain/capture-errors.js';
import type { CaptureRestored } from '../domain/events.js';
import { decideRestoreCapture } from '../domain/decide-restore.js';
import { applyCaptureEvent } from '../domain/apply-capture-event.js';
import { loadOwnedCapture } from './load-owned-capture.js';
import type { LoadCapture, PersistCaptureEvent } from './ports.js';
import type { WriteResult } from './write-result.js';

export type HandleRestoreCaptureDeps = {
  load: LoadCapture;
  persist: PersistCaptureEvent;
};

export const handleRestoreCapture = (
  command: RestoreCaptureCommand,
  deps: HandleRestoreCaptureDeps
): ResultAsync<WriteResult<CaptureRestored>, RestoreCaptureError> => {
  return loadOwnedCapture({
    id: command.id,
    organizationId: command.organizationId,
    load: deps.load,
  }).andThen((current) => {
    const decision = decideRestoreCapture({ current, command });

    if (decision.type === 'Noop') {
      return okAsync({ event: null, view: current });
    }

    return deps.persist({ event: decision, current }).map(() => ({
      event: decision,
      view: applyCaptureEvent(current, decision),
    }));
  });
};

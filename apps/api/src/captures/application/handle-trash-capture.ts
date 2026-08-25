import { okAsync, type ResultAsync } from 'neverthrow';
import type { TrashCaptureCommand } from '../domain/capture-commands.js';
import type { TrashCaptureError } from '../domain/capture-errors.js';
import type { CaptureTrashed } from '../domain/events.js';
import { decideTrashCapture } from '../domain/decide-trash.js';
import { applyCaptureEvent } from '../domain/apply-capture-event.js';
import { loadOwnedCapture } from './load-owned-capture.js';
import type { LoadCapture, PersistCaptureEvent } from './ports.js';
import type { WriteResult } from './write-result.js';

export type HandleTrashCaptureDeps = {
  load: LoadCapture;
  persist: PersistCaptureEvent;
  now: () => string;
};

export const handleTrashCapture = (
  command: TrashCaptureCommand,
  deps: HandleTrashCaptureDeps
): ResultAsync<WriteResult<CaptureTrashed>, TrashCaptureError> => {
  return loadOwnedCapture({
    id: command.id,
    organizationId: command.organizationId,
    load: deps.load,
  }).andThen((current) => {
    const decision = decideTrashCapture({
      current,
      command,
      now: deps.now(),
    });

    if (decision.type === 'Noop') {
      return okAsync({ event: null, view: current });
    }

    return deps.persist({ event: decision, current }).map(() => ({
      event: decision,
      view: applyCaptureEvent(current, decision),
    }));
  });
};

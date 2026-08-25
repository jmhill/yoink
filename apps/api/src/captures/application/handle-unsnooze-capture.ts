import { okAsync, type ResultAsync } from 'neverthrow';
import type { UnsnoozeCaptureCommand } from '../domain/capture-commands.js';
import type { UnsnoozeCaptureError } from '../domain/capture-errors.js';
import type { CaptureUnsnoozed } from '../domain/events.js';
import { decideUnsnoozeCapture } from '../domain/decide-unsnooze.js';
import { applyCaptureEvent } from '../domain/apply-capture-event.js';
import { loadOwnedCapture } from './load-owned-capture.js';
import type { LoadCapture, PersistCaptureEvent } from './ports.js';
import type { WriteResult } from './write-result.js';

export type HandleUnsnoozeCaptureDeps = {
  load: LoadCapture;
  persist: PersistCaptureEvent;
};

export const handleUnsnoozeCapture = (
  command: UnsnoozeCaptureCommand,
  deps: HandleUnsnoozeCaptureDeps
): ResultAsync<WriteResult<CaptureUnsnoozed>, UnsnoozeCaptureError> => {
  return loadOwnedCapture({
    id: command.id,
    organizationId: command.organizationId,
    load: deps.load,
  }).andThen((current) => {
    const decision = decideUnsnoozeCapture({ current, command });

    if (decision.type === 'Noop') {
      return okAsync({ event: null, view: current });
    }

    return deps.persist({ event: decision, current }).map(() => ({
      event: decision,
      view: applyCaptureEvent(current, decision),
    }));
  });
};

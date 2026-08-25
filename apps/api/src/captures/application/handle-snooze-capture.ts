import { errAsync, type ResultAsync } from 'neverthrow';
import type { SnoozeCaptureCommand } from '../domain/capture-commands.js';
import type { SnoozeCaptureError } from '../domain/capture-errors.js';
import type { CaptureSnoozed } from '../domain/events.js';
import { decideSnoozeCapture } from '../domain/decide-snooze.js';
import { applyCaptureEvent } from '../domain/apply-capture-event.js';
import { loadOwnedCapture } from './load-owned-capture.js';
import type { LoadCapture, PersistCaptureEvent } from './ports.js';
import type { WriteResult } from './write-result.js';

export type HandleSnoozeCaptureDeps = {
  load: LoadCapture;
  persist: PersistCaptureEvent;
  now: () => string;
};

export const handleSnoozeCapture = (
  command: SnoozeCaptureCommand,
  deps: HandleSnoozeCaptureDeps
): ResultAsync<WriteResult<CaptureSnoozed>, SnoozeCaptureError> => {
  return loadOwnedCapture({
    id: command.id,
    organizationId: command.organizationId,
    load: deps.load,
  }).andThen((current) => {
    const decision = decideSnoozeCapture({
      current,
      command,
      now: deps.now(),
    });

    if (decision.isErr()) {
      return errAsync(decision.error);
    }

    return deps.persist({ event: decision.value, current }).map(() => ({
      event: decision.value,
      view: applyCaptureEvent(current, decision.value),
    }));
  });
};

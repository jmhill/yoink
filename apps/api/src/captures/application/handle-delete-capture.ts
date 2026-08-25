import { errAsync, type ResultAsync } from 'neverthrow';
import type { DeleteCaptureCommand } from '../domain/capture-commands.js';
import type { DeleteCaptureError } from '../domain/capture-errors.js';
import type { CaptureDeleted } from '../domain/events.js';
import { decideDeleteCapture } from '../domain/decide-delete.js';
import { loadOwnedCapture } from './load-owned-capture.js';
import type { LoadCapture, PersistCaptureEvent } from './ports.js';

export type HandleDeleteCaptureDeps = {
  load: LoadCapture;
  persist: PersistCaptureEvent;
};

export const handleDeleteCapture = (
  command: DeleteCaptureCommand,
  deps: HandleDeleteCaptureDeps
): ResultAsync<CaptureDeleted, DeleteCaptureError> => {
  return loadOwnedCapture({
    id: command.id,
    organizationId: command.organizationId,
    load: deps.load,
  }).andThen((current) => {
    const decision = decideDeleteCapture({ current, command });

    if (decision.isErr()) {
      return errAsync(decision.error);
    }

    return deps.persist({ event: decision.value, current }).map(() => decision.value);
  });
};

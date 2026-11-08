import { err, ok, type Result } from 'neverthrow';
import type { Capture } from '@yoink/api-contracts';
import type { DeleteCaptureCommand } from '../messages/capture-commands.js';
import type { CaptureDeleted } from '../messages/events.js';
import { captureNotInTrashError, type CaptureNotInTrashError } from '../messages/capture-errors.js';

export type DecideDeleteCaptureInput = {
  current: Capture;
  command: DeleteCaptureCommand;
};

export const decideDeleteCapture = ({
  current,
  command,
}: DecideDeleteCaptureInput): Result<CaptureDeleted, CaptureNotInTrashError> => {
  if (current.status !== 'trashed') {
    return err(captureNotInTrashError(command.id));
  }

  return ok({
    type: 'CaptureDeleted',
    id: command.id,
    organizationId: command.organizationId,
  });
};

import { err, ok, type Result } from 'neverthrow';
import type { Capture } from '@yoink/api-contracts';
import type { SnoozeCaptureCommand } from './capture-commands.js';
import type { CaptureSnoozed } from './events.js';
import {
  captureAlreadyTrashedError,
  invalidSnoozeTimeError,
  type CaptureAlreadyTrashedError,
  type InvalidSnoozeTimeError,
} from './capture-errors.js';

export type DecideSnoozeCaptureInput = {
  current: Capture;
  command: SnoozeCaptureCommand;
  now: string;
};

export type DecideSnoozeCaptureError = CaptureAlreadyTrashedError | InvalidSnoozeTimeError;

export const decideSnoozeCapture = ({
  current,
  command,
  now,
}: DecideSnoozeCaptureInput): Result<CaptureSnoozed, DecideSnoozeCaptureError> => {
  if (current.status === 'trashed') {
    return err(captureAlreadyTrashedError(command.id));
  }

  if (new Date(command.until) <= new Date(now)) {
    return err(invalidSnoozeTimeError('Snooze time must be in the future'));
  }

  return ok({
    type: 'CaptureSnoozed',
    id: command.id,
    organizationId: command.organizationId,
    until: command.until,
  });
};

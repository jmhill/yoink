import type { Capture } from '@yoink/api-contracts';
import type { UnsnoozeCaptureCommand } from './capture-commands.js';
import type { CaptureUnsnoozed, Noop } from './events.js';

export type DecideUnsnoozeCaptureInput = {
  current: Capture;
  command: UnsnoozeCaptureCommand;
};

export const decideUnsnoozeCapture = ({
  current,
  command,
}: DecideUnsnoozeCaptureInput): CaptureUnsnoozed | Noop => {
  if (!current.snoozedUntil) {
    return { type: 'Noop' };
  }

  return {
    type: 'CaptureUnsnoozed',
    id: command.id,
    organizationId: command.organizationId,
  };
};

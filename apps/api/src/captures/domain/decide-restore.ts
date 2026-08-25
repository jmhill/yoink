import type { Capture } from '@yoink/api-contracts';
import type { RestoreCaptureCommand } from './capture-commands.js';
import type { CaptureRestored, Noop } from './events.js';

export type DecideRestoreCaptureInput = {
  current: Capture;
  command: RestoreCaptureCommand;
};

export const decideRestoreCapture = ({
  current,
  command,
}: DecideRestoreCaptureInput): CaptureRestored | Noop => {
  if (current.status === 'inbox') {
    return { type: 'Noop' };
  }

  return {
    type: 'CaptureRestored',
    id: command.id,
    organizationId: command.organizationId,
  };
};

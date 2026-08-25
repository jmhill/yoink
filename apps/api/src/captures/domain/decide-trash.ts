import type { Capture } from '@yoink/api-contracts';
import type { TrashCaptureCommand } from './capture-commands.js';
import type { CaptureTrashed, Noop } from './events.js';

export type DecideTrashCaptureInput = {
  current: Capture;
  command: TrashCaptureCommand;
  now: string;
};

export const decideTrashCapture = ({
  current,
  command,
  now,
}: DecideTrashCaptureInput): CaptureTrashed | Noop => {
  if (current.status === 'trashed') {
    return { type: 'Noop' };
  }

  return {
    type: 'CaptureTrashed',
    id: command.id,
    organizationId: command.organizationId,
    trashedAt: now,
  };
};

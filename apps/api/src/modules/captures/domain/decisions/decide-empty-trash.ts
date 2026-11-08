import type { EmptyTrashCommand } from '../messages/capture-commands.js';
import type { CaptureTrashEmptied } from '../messages/events.js';

export type DecideEmptyTrashInput = {
  command: EmptyTrashCommand;
};

export const decideEmptyTrash = ({
  command,
}: DecideEmptyTrashInput): CaptureTrashEmptied => ({
  type: 'CaptureTrashEmptied',
  organizationId: command.organizationId,
});

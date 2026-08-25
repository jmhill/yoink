import type { EmptyTrashCommand } from './capture-commands.js';
import type { CaptureTrashEmptied } from './events.js';

export type DecideEmptyTrashInput = {
  command: EmptyTrashCommand;
};

export const decideEmptyTrash = ({
  command,
}: DecideEmptyTrashInput): CaptureTrashEmptied => ({
  type: 'CaptureTrashEmptied',
  organizationId: command.organizationId,
});

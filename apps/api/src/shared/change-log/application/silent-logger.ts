import type { CommandLogger } from '../../../kernel/command-log.js';

export const silentCommandLogger: CommandLogger = {
  info: () => undefined,
};

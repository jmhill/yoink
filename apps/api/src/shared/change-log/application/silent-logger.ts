import type { CommandLogger } from './command-log.js';

export const silentCommandLogger: CommandLogger = {
  info: () => undefined,
};

import type { CommandLogger } from '../shared/change-log/application/command-log.js';

type PinoInfoLogger = {
  info: (obj: Record<string, unknown>) => void;
};

/**
 * Structured command-outcome logger over the app's Pino logger.
 * One info line per command; never payloads or titles.
 */
export const createPinoCommandLogger = (logger: PinoInfoLogger): CommandLogger => ({
  info: (fields) => {
    logger.info({
      msg: 'command_outcome',
      command: fields.command,
      actorUserId: fields.actorUserId,
      actorKind: fields.actorKind,
      organizationId: fields.organizationId,
      eventKinds: fields.eventKinds,
      errorType: fields.errorType,
    });
  },
});

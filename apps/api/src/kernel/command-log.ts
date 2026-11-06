import type { ResultAsync } from 'neverthrow';
import type { Actor } from './auth-context.js';

export type CommandLogFields = {
  command: string;
  actorUserId: string;
  actorKind: 'user' | 'bot';
  organizationId: string;
  eventKinds?: readonly string[];
  errorType?: string;
};

export type CommandLogger = {
  info: (fields: CommandLogFields) => void;
};

export type CommandLogMeta = {
  command: string;
  organizationId: string;
  actor: Actor;
};

type DomainError = {
  readonly type: string;
};

const actorFields = (actor: Actor) => ({
  actorUserId: actor.userId,
  actorKind: actor.kind,
});

/**
 * One structured log line per command outcome. The logger is a port.
 * This function imports no I/O and no change-log domain. Callers pass the
 * kind strings they already decided (today those are change-log kinds).
 * Payload values and titles are not logged.
 */
export const withCommandLog = <T, E extends DomainError>(
  logger: CommandLogger,
  meta: CommandLogMeta,
  eventKindsOf: (value: T) => readonly string[],
  run: () => ResultAsync<T, E>
): ResultAsync<T, E> => {
  const base = {
    command: meta.command,
    organizationId: meta.organizationId,
    ...actorFields(meta.actor),
  };

  return run()
    .map((value) => {
      logger.info({
        ...base,
        eventKinds: eventKindsOf(value),
      });
      return value;
    })
    .mapErr((error) => {
      logger.info({
        ...base,
        errorType: error.type,
      });
      return error;
    });
};

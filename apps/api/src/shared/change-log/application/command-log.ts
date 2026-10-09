import type { ResultAsync } from 'neverthrow';
import type { Actor } from '../../actor.js';

export type CommandLogFields = {
  command: string;
  actorUserId: string | null;
  actorKind: 'user' | 'bot' | null;
  organizationId: string;
  eventKinds?: string[];
  errorType?: string;
};

export type CommandLogger = {
  info: (fields: CommandLogFields) => void;
};

export type CommandLogMeta = {
  command: string;
  organizationId: string;
  actor: Actor | null;
};

type DomainError = {
  readonly type: string;
};

const actorFields = (actor: Actor | null) => ({
  actorUserId: actor?.userId ?? null,
  actorKind: actor?.kind ?? null,
});

/**
 * Shared command wrapper: one structured log line per command outcome.
 * Pure-ish — takes a logger port, never logs payload values or titles.
 */
export const withCommandLog = <T, E extends DomainError>(
  logger: CommandLogger,
  meta: CommandLogMeta,
  eventKindsOf: (value: T) => string[],
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

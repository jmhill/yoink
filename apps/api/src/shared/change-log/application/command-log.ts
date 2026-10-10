import type { ResultAsync } from 'neverthrow';
import type { Actor } from '../../auth-context.js';
import type { ChangeLogKind } from '../domain/kinds.js';

export type CommandLogFields = {
  command: string;
  actorUserId: string;
  actorKind: 'user' | 'bot';
  organizationId: string;
  eventKinds?: ChangeLogKind[];
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
 * Shared command wrapper: one structured log line per command outcome.
 * Pure-ish — takes a logger port, never logs payload values or titles.
 */
export const withCommandLog = <T, E extends DomainError>(
  logger: CommandLogger,
  meta: CommandLogMeta,
  eventKindsOf: (value: T) => ChangeLogKind[],
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

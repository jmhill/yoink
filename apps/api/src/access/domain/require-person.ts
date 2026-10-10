import { err, ok, type Result } from 'neverthrow';
import type { Actor, UserActor } from '../../shared/auth-context.js';

export type NotAPersonError = {
  readonly type: 'NOT_A_PERSON';
  readonly message: string;
};

export const notAPersonError = (): NotAPersonError => ({
  type: 'NOT_A_PERSON',
  message: 'This action requires a person',
});

/** A person (session or their own API token). Agents are refused. */
export const requirePerson = (actor: Actor): Result<UserActor, NotAPersonError> => {
  if (actor.kind !== 'user') {
    return err(notAPersonError());
  }

  return ok(actor);
};

import { err, ok, type Result } from 'neverthrow';
import type { Actor, UserActor } from '../../shared/auth-context.js';
import { botCannotManageTokensError, type BotCannotManageTokensError } from './token-errors.js';

/**
 * A person signed in with a web session.
 * Personal API tokens and agent tokens are refused.
 */
export const requireWebSessionPerson = (
  actor: Actor
): Result<UserActor, BotCannotManageTokensError> => {
  if (actor.kind !== 'user' || actor.via !== 'session') {
    return err(botCannotManageTokensError());
  }

  return ok(actor);
};

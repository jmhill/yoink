import { err, ok, type Result } from 'neverthrow';
import type { Actor, UserActor } from './actor.js';
import { botCannotManageTokensError, type BotCannotManageTokensError } from './token-errors.js';

export const requireHumanActor = (
  actor: Actor
): Result<UserActor, BotCannotManageTokensError> => {
  if (actor.kind !== 'user') {
    return err(botCannotManageTokensError());
  }

  return ok(actor);
};

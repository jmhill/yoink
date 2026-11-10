import { errAsync, type ResultAsync } from 'neverthrow';
import type { CommitFailure, UnitOfWork } from '../../kernel/unit-of-work.js';
import type { RevokeTokenCommand } from '../domain/token-commands.js';
import type { TokenRevoked } from '../domain/token-events.js';
import { decideRevokeToken } from '../domain/decide-revoke-token.js';
import { planRevokeToken, type RevokeTokenPlan } from '../domain/token-plan.js';
import { tokenStorageError } from '../domain/auth-errors.js';
import type { RevokeTokenError } from '../domain/token-errors.js';
import type { LoadToken, PersistTokenRevoked } from './token-ports.js';

export type HandleRevokeTokenDeps = {
  load: LoadToken;
  persistRevoke?: PersistTokenRevoked;
  unitOfWork?: UnitOfWork;
  now: () => string;
};

const commitRevoke = (
  event: TokenRevoked,
  deps: HandleRevokeTokenDeps
): ResultAsync<void, RevokeTokenError> => {
  if (deps.unitOfWork !== undefined) {
    const plan: RevokeTokenPlan = planRevokeToken({
      tokenId: event.id,
      revokedAt: event.revokedAt,
    });
    return deps.unitOfWork
      .commit([
        {
          result: null,
          events: [],
          step: { owner: 'access', plan },
        },
      ])
      .map(() => undefined)
      .mapErr((failure: CommitFailure) => tokenStorageError('Failed to revoke token', failure));
  }
  if (deps.persistRevoke !== undefined) {
    return deps.persistRevoke(event);
  }
  return errAsync(tokenStorageError('Failed to revoke token'));
};

export const handleRevokeToken = (
  command: RevokeTokenCommand,
  deps: HandleRevokeTokenDeps
): ResultAsync<TokenRevoked, RevokeTokenError> => {
  return deps.load(command.tokenId).andThen((current) => {
    const decision = decideRevokeToken({
      command,
      current,
      now: deps.now(),
    });
    if (decision.isErr()) {
      return errAsync(decision.error);
    }

    const event = decision.value;
    return commitRevoke(event, deps).map(() => event);
  });
};

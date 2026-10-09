import { errAsync, type ResultAsync } from 'neverthrow';
import type { RevokeTokenCommand } from '../domain/token-commands.js';
import type { TokenRevoked } from '../domain/token-events.js';
import { decideRevokeToken } from '../domain/decide-revoke-token.js';
import type { RevokeTokenError } from '../domain/token-errors.js';
import type { LoadActorMembership, LoadToken, LoadTokenOwner, PersistTokenEvent } from './token-ports.js';

export type HandleRevokeTokenDeps = {
  load: LoadToken;
  loadMembership: LoadActorMembership;
  loadOwner: LoadTokenOwner;
  persist: PersistTokenEvent;
  now: () => string;
};

export const handleRevokeToken = (
  command: RevokeTokenCommand,
  deps: HandleRevokeTokenDeps
): ResultAsync<TokenRevoked, RevokeTokenError> => {
  const actorUserId = command.actor.userId;

  return deps.load(command.tokenId).andThen((current) =>
    deps.loadMembership(actorUserId, command.organizationId).andThen((membership) =>
      deps.loadOwner(current?.userId ?? command.userId).andThen((owner) => {
        const decision = decideRevokeToken({
          command,
          current,
          actorRole: membership?.role ?? null,
          tokenOwnerKind: owner?.kind ?? 'human',
          now: deps.now(),
        });
        if (decision.isErr()) {
          return errAsync(decision.error);
        }

        const event = decision.value;
        return deps.persist({ event }).map(() => event);
      })
    )
  );
};

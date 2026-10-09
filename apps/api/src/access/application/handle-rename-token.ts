import { errAsync, type ResultAsync } from 'neverthrow';
import type { RenameTokenCommand } from '../domain/token-commands.js';
import type { TokenRenamed } from '../domain/token-events.js';
import { toTokenInfo, type TokenInfo, type TokenOwnerInfo } from '../domain/token-info.js';
import { applyTokenEvent } from '../domain/apply-token-event.js';
import { decideRenameToken } from '../domain/decide-rename-token.js';
import { tokenStorageError } from '../domain/auth-errors.js';
import type { RenameTokenError } from '../domain/token-errors.js';
import type {
  ListOrgTokens,
  LoadActorMembership,
  LoadToken,
  LoadTokenOwner,
  PersistTokenEvent,
} from './token-ports.js';

export type HandleRenameTokenDeps = {
  load: LoadToken;
  listOrgTokens: ListOrgTokens;
  loadMembership: LoadActorMembership;
  loadOwner: LoadTokenOwner;
  persist: PersistTokenEvent;
};

export type RenameTokenResult = {
  event: TokenRenamed;
  token: TokenInfo;
};

const fallbackOwner = (userId: string): TokenOwnerInfo => ({
  userId,
  name: null,
  kind: 'human',
});

export const handleRenameToken = (
  command: RenameTokenCommand,
  deps: HandleRenameTokenDeps
): ResultAsync<RenameTokenResult, RenameTokenError> => {
  const actorUserId = command.actor.userId;

  return deps.load(command.tokenId).andThen((current) =>
    deps.loadMembership(actorUserId, command.organizationId).andThen((membership) => {
      const ownerId = current?.userId ?? command.userId;
      return deps.loadOwner(ownerId).andThen((owner) => {
        const persistDecision = (existingNames: readonly string[]) => {
          const decision = decideRenameToken({
            command,
            current,
            existingNames,
            actorRole: membership?.role ?? null,
            tokenOwnerKind: owner?.kind ?? 'human',
          });

          if (decision.isErr()) {
            return errAsync(decision.error);
          }

          const event = decision.value;
          const projected = applyTokenEvent(current ? toTokenInfo(current, owner ?? fallbackOwner(ownerId)) : null, event);
          if (!projected) {
            return errAsync(tokenStorageError('Rename did not project a token'));
          }

          return deps.persist({ event }).map(() => ({
            event,
            token: {
              ...projected,
              owner: owner ?? fallbackOwner(ownerId),
            },
          }));
        };

        if (!current || current.organizationId !== command.organizationId) {
          return persistDecision([]);
        }

        return deps.listOrgTokens(command.organizationId).andThen((orgTokens) =>
          persistDecision(
            orgTokens
              .map((token) => token.name)
              .filter((name): name is string => name !== null)
          )
        );
      });
    })
  );
};

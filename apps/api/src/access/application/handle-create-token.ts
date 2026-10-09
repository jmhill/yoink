import { errAsync, type ResultAsync } from 'neverthrow';
import type { CreateNamedTokenCommand } from '../domain/token-commands.js';
import type { TokenCreated } from '../domain/token-events.js';
import type { TokenInfo, TokenOwnerInfo } from '../domain/token-info.js';
import { applyTokenEvent } from '../domain/apply-token-event.js';
import { decideCreateToken } from '../domain/decide-create-token.js';
import { tokenStorageError } from '../domain/auth-errors.js';
import type { CreateNamedTokenError } from '../domain/token-errors.js';
import type {
  HashSecret,
  ListOrgTokens,
  LoadActorMembership,
  LoadTokenOwner,
  PersistTokenEvent,
} from './token-ports.js';

export type HandleCreateTokenDeps = {
  listOrgTokens: ListOrgTokens;
  loadMembership: LoadActorMembership;
  loadOwner: LoadTokenOwner;
  persist: PersistTokenEvent;
  hashSecret: HashSecret;
  nextId: () => string;
  nextSecret: () => string;
  now: () => string;
  maxTokensPerUserPerOrg: number;
};

export type CreateTokenResult = {
  event: TokenCreated;
  token: TokenInfo;
  rawToken: string;
};

const unknownOwner = (userId: string): TokenOwnerInfo => ({
  userId,
  name: null,
  kind: 'human',
});

export const handleCreateToken = (
  command: CreateNamedTokenCommand,
  deps: HandleCreateTokenDeps
): ResultAsync<CreateTokenResult, CreateNamedTokenError> => {
  const actorUserId = command.actor.userId;

  return deps.listOrgTokens(command.organizationId).andThen((orgTokens) =>
    deps.loadMembership(actorUserId, command.organizationId).andThen((membership) =>
      deps.loadOwner(command.userId).andThen((owner) => {
        const named = orgTokens
          .map((token) => token.name)
          .filter((name): name is NonNullable<typeof name> => name !== null);
        const tokenCountForUser = orgTokens.filter(
          (token) => token.userId === command.userId
        ).length;

        const id = deps.nextId();
        const secret = deps.nextSecret();
        const decision = decideCreateToken({
          command,
          existingNames: named,
          tokenCountForUser,
          maxTokensPerUserPerOrg: deps.maxTokensPerUserPerOrg,
          actorRole: membership?.role ?? null,
          targetKind: owner?.kind ?? 'human',
          id,
          now: deps.now(),
        });

        if (decision.isErr()) {
          return errAsync(decision.error);
        }

        const event = decision.value;
        const projected = applyTokenEvent(null, event);
        if (!projected) {
          return errAsync(tokenStorageError('Create did not project a token'));
        }

        return deps.hashSecret(secret).andThen((tokenHash) =>
          deps.persist({ event, tokenHash }).map(() => ({
            event,
            token: {
              ...projected,
              owner: owner ?? unknownOwner(command.userId),
            },
            rawToken: `${id}:${secret}`,
          }))
        );
      })
    )
  );
};

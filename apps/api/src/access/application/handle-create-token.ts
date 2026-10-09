import { errAsync, type ResultAsync } from 'neverthrow';
import type { CreateTokenCommand } from '../domain/token-commands.js';
import type { TokenCreated } from '../domain/token-events.js';
import type { TokenInfo } from '../domain/token-info.js';
import { applyTokenEvent } from '../domain/apply-token-event.js';
import { decideCreateToken } from '../domain/decide-create-token.js';
import { tokenStorageError } from '../domain/auth-errors.js';
import type { CreateTokenError } from '../domain/token-errors.js';
import type {
  HashSecret,
  ListUserOrgTokens,
  LoadActorMembership,
  LoadTokenOwner,
  PersistTokenCreated,
} from './token-ports.js';

export type HandleCreateTokenDeps = {
  listUserOrgTokens: ListUserOrgTokens;
  loadMembership: LoadActorMembership;
  loadOwner: LoadTokenOwner;
  persistCreate: PersistTokenCreated;
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

export const handleCreateToken = (
  command: CreateTokenCommand,
  deps: HandleCreateTokenDeps
): ResultAsync<CreateTokenResult, CreateTokenError> => {
  const actorUserId = command.actor.userId;

  return deps.listUserOrgTokens(command.userId, command.organizationId).andThen((userTokens) =>
    deps.loadMembership(actorUserId, command.organizationId).andThen((membership) =>
      deps.loadOwner(command.userId).andThen((owner) => {
        const tokenCountForUser = userTokens.length;

        const id = deps.nextId();
        const secret = deps.nextSecret();
        const decision = decideCreateToken({
          command,
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
          deps.persistCreate({ event, tokenHash }).map(() => ({
            event,
            token: projected,
            rawToken: `${id}:${secret}`,
          }))
        );
      })
    )
  );
};

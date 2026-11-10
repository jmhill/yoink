import { errAsync, type ResultAsync } from 'neverthrow';
import type { CommitFailure, UnitOfWork } from '../../kernel/unit-of-work.js';
import type { CreateTokenCommand } from '../domain/token-commands.js';
import type { TokenCreated } from '../domain/token-events.js';
import type { TokenInfo } from '../domain/token-info.js';
import { applyTokenEvent } from '../domain/apply-token-event.js';
import { decideCreateToken } from '../domain/decide-create-token.js';
import { planIssueToken, type IssueTokenPlan } from '../domain/token-plan.js';
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
  persistCreate?: PersistTokenCreated;
  unitOfWork?: UnitOfWork;
  hashSecret: HashSecret;
  nextId: () => string;
  nextSecret: () => string;
  now: () => string;
  maxTokensPerUserPerOrg: number;
};

const commitIssue = (
  plan: IssueTokenPlan,
  deps: HandleCreateTokenDeps
): ResultAsync<void, CreateTokenError> => {
  if (deps.unitOfWork !== undefined) {
    return deps.unitOfWork
      .commit([
        {
          result: null,
          events: [],
          step: { owner: 'access', plan },
        },
      ])
      .map(() => undefined)
      .mapErr((failure: CommitFailure) => tokenStorageError('Failed to save token', failure));
  }
  if (deps.persistCreate !== undefined) {
    return deps.persistCreate({
      event: {
        type: 'TokenCreated',
        id: plan.id,
        userId: plan.userId,
        organizationId: plan.organizationId,
        name: plan.name,
        createdAt: plan.createdAt,
      },
      tokenHash: plan.tokenHash,
    });
  }
  return errAsync(tokenStorageError('Failed to save token'));
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
          commitIssue(
            planIssueToken({
              id: event.id,
              userId: event.userId,
              organizationId: event.organizationId,
              tokenHash,
              name: event.name,
              createdAt: event.createdAt,
            }),
            deps
          ).map(() => ({
            event,
            token: projected,
            rawToken: `${id}:${secret}`,
          }))
        );
      })
    )
  );
};

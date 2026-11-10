import { errAsync, ResultAsync } from 'neverthrow';
import type { Clock } from '../../kernel/clock.js';
import type { IdGenerator } from '../../kernel/id-generator.js';
import type { PasswordHasher } from '../../kernel/password-hasher.js';
import type { CommitFailure, UnitOfWork } from '../../kernel/unit-of-work.js';
import type { MintAgentPlan } from '../domain/agent-plan.js';
import { tokenStorageError, type TokenStorageError } from '../domain/auth-errors.js';
import {
  decideMintAgent,
  decideMintAgentCommand,
  decideMintAgentMembership,
  planMintAgent,
  type MintAgentCommand,
  type MintAgentDecision,
} from '../domain/decide-mint-agent.js';
import type { OrganizationMembership } from '../domain/organization-membership.js';
import type { OrganizationMembershipStore } from '../domain/organization-membership-store.js';
import type {
  InsufficientPermissionsError,
  MembershipNotFoundError,
  MembershipStorageError,
  OrganizationNotFoundError,
  OrganizationStorageError,
} from '../domain/organization-errors.js';
import type { OrganizationStore } from '../domain/organization-store.js';
import type { TokenInfo } from '../domain/token-info.js';
import { toTokenInfo } from '../domain/token-info.js';
import type { BotCannotManageTokensError, InvalidTokenNameError } from '../domain/token-errors.js';
import type { TokenStore } from '../domain/token-store.js';
import type { User } from '../domain/user.js';
import type { UserStorageError } from '../domain/user-errors.js';
import type { UserStore } from '../domain/user-store.js';

export type { MintAgentCommand } from '../domain/decide-mint-agent.js';

export type MintedAgent = {
  readonly user: User;
  readonly membership: OrganizationMembership;
  readonly token: TokenInfo;
  readonly rawToken: string;
};

export type AgentServiceError =
  | BotCannotManageTokensError
  | InvalidTokenNameError
  | MembershipNotFoundError
  | InsufficientPermissionsError
  | OrganizationNotFoundError
  | OrganizationStorageError
  | MembershipStorageError
  | UserStorageError
  | TokenStorageError;

export type AgentService = {
  /**
   * Mint a token-only agent member in the organization.
   * The caller must be a web-session person who is an owner or admin.
   * The API token is returned once.
   */
  mintAgent(command: MintAgentCommand): ResultAsync<MintedAgent, AgentServiceError>;
};

export type AgentServiceDependencies = {
  userStore: UserStore;
  membershipStore: OrganizationMembershipStore;
  organizationStore: OrganizationStore;
  tokenStore: TokenStore;
  clock: Clock;
  idGenerator: IdGenerator;
  passwordHasher: PasswordHasher;
  /**
   * The composition root passes the sqlite unit of work. The plan then
   * commits through the access participant. Tests may omit it and apply
   * the same plan through these stores.
   */
  unitOfWork?: UnitOfWork;
};

const mintedFrom = (plan: MintAgentPlan, rawToken: string): MintedAgent => ({
  user: plan.user,
  membership: plan.membership,
  token: toTokenInfo(plan.token),
  rawToken,
});

/**
 * The command is decided before any query. The membership query, then the
 * organization query, go in. A mint plan comes out and is committed. The
 * raw secret is not in the plan.
 */
export const createAgentService = (deps: AgentServiceDependencies): AgentService => {
  const persist = (
    plan: MintAgentPlan
  ): ResultAsync<void, UserStorageError | MembershipStorageError | TokenStorageError> => {
    if (deps.unitOfWork === undefined) {
      return deps.userStore
        .save(plan.user)
        .andThen(() => deps.membershipStore.save(plan.membership))
        .andThen(() => deps.tokenStore.save(plan.token));
    }
    return deps.unitOfWork
      .commit([
        {
          result: null,
          events: [],
          step: { owner: 'access', plan },
        },
      ])
      .map(() => undefined)
      .mapErr((failure: CommitFailure) => tokenStorageError('Failed to mint agent', failure));
  };

  const write = (
    decision: MintAgentDecision
  ): ResultAsync<MintedAgent, TokenStorageError | UserStorageError | MembershipStorageError> => {
    const userId = deps.idGenerator.generate();
    const membershipId = deps.idGenerator.generate();
    const tokenId = deps.idGenerator.generate();
    const secret = deps.idGenerator.generate();
    const now = deps.clock.now().toISOString();
    return ResultAsync.fromPromise(deps.passwordHasher.hash(secret), (error) =>
      tokenStorageError('Failed to hash token secret', error)
    ).andThen((tokenHash) => {
      const plan = planMintAgent({
        decision,
        userId,
        membershipId,
        tokenId,
        tokenHash,
        now,
      });
      return persist(plan).map(() => mintedFrom(plan, `${tokenId}:${secret}`));
    });
  };

  return {
    mintAgent(command) {
      const requested = decideMintAgentCommand(command);
      if (requested.isErr()) {
        return errAsync(requested.error);
      }
      const request = requested.value;

      return deps.membershipStore
        .findByUserAndOrg(request.actorUserId, request.organizationId)
        .andThen((membership) => {
          const accepted = decideMintAgentMembership({ request, membership });
          if (accepted.isErr()) {
            return errAsync(accepted.error);
          }

          return deps.organizationStore.findById(request.organizationId).andThen((organization) => {
            const decision = decideMintAgent({ request, organization });
            if (decision.isErr()) {
              return errAsync(decision.error);
            }
            return write(decision.value);
          });
        });
    },
  };
};

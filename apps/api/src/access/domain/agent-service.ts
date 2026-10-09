import { errAsync, type ResultAsync } from 'neverthrow';
import type { Clock, IdGenerator } from '@yoink/infrastructure';
import type { Actor } from './actor.js';
import type { User } from './user.js';
import { agentEmailFor } from './user.js';
import type { UserService } from './user-service.js';
import type { MembershipService } from './membership-service.js';
import type { OrganizationMembership } from './organization-membership.js';
import type { CreateNamedToken } from './create-named-token.js';
import type { TokenInfo } from './token-info.js';
import type { TokenStore } from './token-store.js';
import { requireHumanActor } from './require-human-actor.js';
import { parseTokenName, tokenNameIsTaken } from './token-name.js';
import { duplicateTokenNameError, type CreateNamedTokenError } from './token-errors.js';
import {
  membershipNotFoundError,
  insufficientPermissionsError,
  type MembershipServiceError,
} from './organization-errors.js';
import type { UserServiceError } from './user-errors.js';

export type MintAgentCommand = {
  actor: Actor;
  organizationId: string;
  name: string;
};

export type MintedAgent = {
  user: User;
  membership: OrganizationMembership;
  token: TokenInfo;
  rawToken: string;
};

export type AgentServiceError = MembershipServiceError | UserServiceError | CreateNamedTokenError;

export type AgentService = {
  /**
   * Mint a token-only agent member in the organization.
   * Caller must be a human owner or admin. Returns the agent's API token once.
   */
  mintAgent(command: MintAgentCommand): ResultAsync<MintedAgent, AgentServiceError>;
};

export type AgentServiceDependencies = {
  userService: UserService;
  membershipService: MembershipService;
  createToken: CreateNamedToken;
  listOrgTokens: TokenStore['findByOrganizationId'];
  clock: Clock;
  idGenerator: IdGenerator;
};

export const createAgentService = (deps: AgentServiceDependencies): AgentService => {
  const { userService, membershipService, createToken, listOrgTokens, clock, idGenerator } = deps;

  return {
    mintAgent(command: MintAgentCommand): ResultAsync<MintedAgent, AgentServiceError> {
      const { actor, organizationId, name } = command;

      const parsed = parseTokenName(name);
      if (parsed.isErr()) {
        return errAsync(parsed.error);
      }

      const human = requireHumanActor(actor);
      if (human.isErr()) {
        return errAsync(human.error);
      }

      const actorUserId = human.value.userId;
      const tokenName = parsed.value;

      return membershipService
        .getMembership({ userId: actorUserId, organizationId })
        .andThen((actorMembership) => {
          if (!actorMembership) {
            return errAsync(membershipNotFoundError({ userId: actorUserId, organizationId }));
          }

          if (actorMembership.role === 'member') {
            return errAsync(insufficientPermissionsError('admin', actorMembership.role));
          }

          return listOrgTokens(organizationId).andThen((orgTokens) => {
            const existingNames = orgTokens
              .map((token) => token.name)
              .filter((existing): existing is NonNullable<typeof existing> => existing !== null);

            if (tokenNameIsTaken(tokenName, existingNames)) {
              return errAsync(duplicateTokenNameError(tokenName));
            }

            const userId = idGenerator.generate();
            const now = clock.now().toISOString();

            return userService
              .createUser({
                id: userId,
                email: agentEmailFor(userId),
                name: tokenName,
                kind: 'agent',
                createdAt: now,
              })
              .andThen((user) =>
                membershipService
                  .addMember({
                    userId: user.id,
                    organizationId,
                    role: 'member',
                    isPersonalOrg: false,
                  })
                  .andThen((membership) =>
                    createToken({
                      actor: human.value,
                      userId: user.id,
                      organizationId,
                      name: tokenName,
                    }).map(({ token, rawToken }) => ({
                      user,
                      membership,
                      token,
                      rawToken,
                    }))
                  )
              );
          });
        });
    },
  };
};

import { errAsync, type ResultAsync } from 'neverthrow';
import type { Clock, IdGenerator } from '@yoink/infrastructure';
import type { User } from './user.js';
import { agentEmailFor } from './user.js';
import type { UserService } from './user-service.js';
import type { MembershipService } from './membership-service.js';
import type { OrganizationMembership } from './organization-membership.js';
import type { UserTokenService, TokenInfo } from './user-token-service.js';
import {
  membershipNotFoundError,
  insufficientPermissionsError,
  type MembershipServiceError,
} from './organization-errors.js';
import type { UserServiceError } from './user-errors.js';
import type { UserTokenServiceError } from './auth-errors.js';

export type MintAgentCommand = {
  actorUserId: string;
  organizationId: string;
  name: string;
};

export type MintedAgent = {
  user: User;
  membership: OrganizationMembership;
  token: TokenInfo;
  rawToken: string;
};

export type AgentServiceError = MembershipServiceError | UserServiceError | UserTokenServiceError;

export type AgentService = {
  /**
   * Mint a token-only agent member in the organization.
   * Caller must be owner or admin. Returns the agent's API token once.
   */
  mintAgent(command: MintAgentCommand): ResultAsync<MintedAgent, AgentServiceError>;
};

export type AgentServiceDependencies = {
  userService: UserService;
  membershipService: MembershipService;
  userTokenService: UserTokenService;
  clock: Clock;
  idGenerator: IdGenerator;
};

export const createAgentService = (deps: AgentServiceDependencies): AgentService => {
  const { userService, membershipService, userTokenService, clock, idGenerator } = deps;

  return {
    mintAgent(command: MintAgentCommand): ResultAsync<MintedAgent, AgentServiceError> {
      const { actorUserId, organizationId, name } = command;

      return membershipService
        .getMembership({ userId: actorUserId, organizationId })
        .andThen((actorMembership) => {
          if (!actorMembership) {
            return errAsync(membershipNotFoundError({ userId: actorUserId, organizationId }));
          }

          if (actorMembership.role === 'member') {
            return errAsync(insufficientPermissionsError('admin', actorMembership.role));
          }

          const userId = idGenerator.generate();
          const now = clock.now().toISOString();

          return userService
            .createUser({
              id: userId,
              email: agentEmailFor(userId),
              name,
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
                  userTokenService
                    .createToken({
                      userId: user.id,
                      organizationId,
                      name,
                    })
                    .map(({ token, rawToken }) => ({
                      user,
                      membership,
                      token,
                      rawToken,
                    }))
                )
            );
        });
    },
  };
};

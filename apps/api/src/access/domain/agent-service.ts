import { errAsync, type ResultAsync } from 'neverthrow';
import type { Clock, IdGenerator } from '@yoink/infrastructure';
import type { Actor } from './actor.js';
import type { User } from './user.js';
import { agentEmailFor } from './user.js';
import type { UserService } from './user-service.js';
import type { MembershipService } from './membership-service.js';
import type { OrganizationMembership } from './organization-membership.js';
import type { CreateToken } from './create-token.js';
import type { TokenInfo } from './token-info.js';
import { requireHumanActor } from './require-human-actor.js';
import type { CreateTokenError } from './token-errors.js';
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

export type AgentServiceError = MembershipServiceError | UserServiceError | CreateTokenError;

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
  createToken: CreateToken;
  clock: Clock;
  idGenerator: IdGenerator;
};

export const createAgentService = (deps: AgentServiceDependencies): AgentService => {
  const { userService, membershipService, createToken, clock, idGenerator } = deps;

  return {
    mintAgent(command: MintAgentCommand): ResultAsync<MintedAgent, AgentServiceError> {
      const { actor, organizationId, name } = command;
      const human = requireHumanActor(actor);
      if (human.isErr()) {
        return errAsync(human.error);
      }

      const agentName = name.trim();
      if (agentName.length === 0) {
        return errAsync({ type: 'INVALID_TOKEN_NAME', message: 'Name is required' });
      }

      const actorUserId = human.value.userId;

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
              name: agentName,
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
                    name: agentName,
                  }).map(({ token, rawToken }) => ({
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

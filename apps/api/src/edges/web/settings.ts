import { implement } from '@orpc/server';
import { webSettingsContract } from '@yoink/api-contracts/web';
import type { AgentService } from '../../access/domain/index.js';
import type { InvitationService } from '../../access/domain/invitation-service.js';
import type { MembershipService } from '../../access/domain/membership-service.js';
import type { SessionService } from '../../access/domain/session-service.js';
import type { UserService } from '../../access/domain/user-service.js';
import { principalKindOf } from '../../access/domain/user.js';
import type { ChangeMemberRoleHandler } from '../../access/application/handle-change-member-role.js';
import type { ReissueAgentToken } from '../../access/application/handle-reissue-agent-token.js';
import type { RemoveMemberHandler } from '../../access/application/handle-remove-member.js';
import type { TransferOwnershipHandler } from '../../access/application/handle-transfer-ownership.js';
import type { TokenHandlers } from '../../access/application/create-token-handlers.js';
import {
  accessHttpError,
  accessInternalError,
  createInvitationErrorResponse,
  listPendingInvitationErrorResponse,
  revokeInvitationErrorResponse,
} from '../_shared/auth/access-http-errors.js';
import type { OrpcHttpContext } from '../_shared/orpc/http-context.js';
import {
  changeMemberRoleErrorResponse,
  createTokenFailure,
  deleteTokenFailure,
  leaveErrorResponse,
  listTokensFailure,
  membershipFailure,
  mintAgentFailure,
  reissueAgentTokenErrorResponse,
  removeMemberErrorResponse,
  switchOrganizationFailure,
  transferOwnershipErrorResponse,
  userFailure,
} from './settings-errors.js';

/**
 * Methods this screen calls. The rest of each service stays off the port.
 */
export type WebSettingsDependencies = {
  sessionService: Pick<SessionService, 'switchOrganization'>;
  membershipService: Pick<MembershipService, 'getMembership' | 'listMemberships' | 'hasRole'>;
  userService: Pick<UserService, 'getUsersByIds'>;
  agentService: Pick<AgentService, 'mintAgent'>;
  reissueAgentToken: ReissueAgentToken;
  transferOwnership: TransferOwnershipHandler;
  changeMemberRole: ChangeMemberRoleHandler;
  removeMember: RemoveMemberHandler;
  invitationService: Pick<
    InvitationService,
    'createInvitation' | 'listPendingInvitations' | 'revokeInvitation'
  >;
  tokenHandlers: Pick<TokenHandlers, 'list' | 'create' | 'revoke'>;
};

/**
 * Settings and organizations. Each handler calls one command, or only queries.
 */
export const createWebSettingsHandlers = (deps: WebSettingsDependencies) => {
  const web = implement(webSettingsContract).$context<OrpcHttpContext>();

  return web.router({
    switchOrganization: web.switchOrganization.handler(async ({ input, context }) => {
      const session = context.request.userSession;
      if (!session) {
        throw accessHttpError({
          code: 'BAD_REQUEST',
          message: 'Organization switching requires session authentication (not token)',
        });
      }
      const result = await deps.sessionService.switchOrganization(session.id, input.organizationId);
      return result.match(
        () => ({ success: true as const }),
        (error) => {
          throw switchOrganizationFailure(error, input.organizationId);
        }
      );
    }),
    leave: web.leave.handler(async ({ input, context }) => {
      const session = context.request.userSession;
      if (!session) {
        throw accessHttpError({ code: 'UNAUTHORIZED', message: 'Authentication required' });
      }
      const result = await deps.removeMember({
        organizationId: input.organizationId,
        userId: session.userId,
        by: { kind: 'self' },
      });
      return result.match(
        () => ({ success: true as const }),
        (error) => {
          throw leaveErrorResponse(error);
        }
      );
    }),
    transferOwner: web.transferOwner.handler(async ({ input, context }) => {
      const result = await deps.transferOwnership({
        organizationId: input.organizationId,
        toUserId: input.userId,
        callerUserId: context.request.authContext.userId,
        actorKind: context.request.authContext.principalKind,
      });
      return result.match(
        (view) => view,
        (error) => {
          throw transferOwnershipErrorResponse(error);
        }
      );
    }),
    listMembers: web.listMembers.handler(async ({ input, context }) => {
      const { userId } = context.request.authContext;
      const membershipResult = await deps.membershipService.getMembership({
        userId,
        organizationId: input.organizationId,
      });
      if (membershipResult.isErr()) {
        throw membershipFailure(membershipResult.error, 'Failed to check membership');
      }
      if (!membershipResult.value) {
        throw accessHttpError({
          code: 'FORBIDDEN',
          message: 'Not a member of this organization',
        });
      }

      const membersResult = await deps.membershipService.listMemberships({
        organizationId: input.organizationId,
      });
      if (membersResult.isErr()) {
        throw membershipFailure(membersResult.error, 'Failed to list members');
      }

      const usersResult = await deps.userService.getUsersByIds(
        membersResult.value.map((membership) => membership.userId)
      );
      if (usersResult.isErr()) {
        throw userFailure(usersResult.error, 'Failed to fetch user details');
      }

      const usersById = new Map(usersResult.value.map((user) => [user.id, user]));
      const members = membersResult.value.map((membership) => {
        const user = usersById.get(membership.userId);
        return {
          userId: membership.userId,
          email: user?.email ?? 'unknown',
          name: user?.name,
          kind: user ? principalKindOf(user) : ('human' as const),
          role: membership.role,
          joinedAt: membership.joinedAt,
        };
      });
      return { members };
    }),
    changeMemberRole: web.changeMemberRole.handler(async ({ input, context }) => {
      const result = await deps.changeMemberRole({
        organizationId: input.organizationId,
        userId: input.userId,
        newRole: input.role,
        callerUserId: context.request.authContext.userId,
        callerVia: context.request.authContext.actor.via,
        principalKind: context.request.authContext.principalKind,
      });
      return result.match(
        (member) => ({ member }),
        (error) => {
          throw changeMemberRoleErrorResponse(error, context.request.authContext.userId);
        }
      );
    }),
    removeMember: web.removeMember.handler(async ({ input, context }) => {
      const session = context.request.userSession;
      if (!session) {
        throw accessHttpError({ code: 'UNAUTHORIZED', message: 'Authentication required' });
      }
      const result = await deps.removeMember({
        organizationId: input.organizationId,
        userId: input.userId,
        by: { kind: 'member', userId: session.userId },
      });
      return result.match(
        () => undefined,
        (error) => {
          throw removeMemberErrorResponse(error);
        }
      );
    }),
    createAgent: web.createAgent.handler(async ({ input, context }) => {
      const result = await deps.agentService.mintAgent({
        actor: context.request.authContext.actor,
        organizationId: input.organizationId,
        name: input.name,
      });
      return result.match(
        ({ user, membership, token, rawToken }) => ({
          agent: {
            userId: user.id,
            name: user.name ?? input.name,
            kind: 'agent' as const,
            role: membership.role,
          },
          token,
          rawToken,
        }),
        (error) => {
          throw mintAgentFailure(error);
        }
      );
    }),
    reissueAgentToken: web.reissueAgentToken.handler(async ({ input, context }) => {
      const result = await deps.reissueAgentToken({
        actor: context.request.authContext.actor,
        organizationId: input.organizationId,
        memberUserId: input.userId,
      });
      return result.match(
        ({ token, rawToken }) => ({ token, rawToken }),
        (error) => {
          throw reissueAgentTokenErrorResponse(error, context.request.authContext.actor.userId);
        }
      );
    }),
    createInvitation: web.createInvitation.handler(async ({ input, context }) => {
      const result = await deps.invitationService.createInvitation({
        organizationId: input.organizationId,
        invitedByUserId: context.request.authContext.userId,
        role: input.role,
        email: input.email,
        expiresInDays: input.expiresInDays,
      });
      return result.match(
        (invitation) => invitation,
        (error) => {
          throw createInvitationErrorResponse(error);
        }
      );
    }),
    listPendingInvitations: web.listPendingInvitations.handler(async ({ input, context }) => {
      const hasPermission = await deps.membershipService.hasRole({
        userId: context.request.authContext.userId,
        organizationId: input.organizationId,
        requiredRole: 'admin',
      });
      if (hasPermission.isErr()) {
        throw accessInternalError(hasPermission.error);
      }
      if (!hasPermission.value) {
        throw accessHttpError({ code: 'FORBIDDEN', message: 'Insufficient permissions' });
      }
      const result = await deps.invitationService.listPendingInvitations({
        organizationId: input.organizationId,
      });
      return result.match(
        (pending) => ({ invitations: pending }),
        (error) => {
          throw listPendingInvitationErrorResponse(error);
        }
      );
    }),
    revokeInvitation: web.revokeInvitation.handler(async ({ input, context }) => {
      const result = await deps.invitationService.revokeInvitation({
        invitationId: input.invitationId,
        revokedByUserId: context.request.authContext.userId,
      });
      return result.match(
        () => undefined,
        (error) => {
          throw revokeInvitationErrorResponse(error);
        }
      );
    }),
    listTokens: web.listTokens.handler(async ({ context }) => {
      const { userId, organizationId, actor } = context.request.authContext;
      const result = await deps.tokenHandlers.list({ actor, userId, organizationId });
      return result.match(
        (page) => page,
        (error) => {
          throw listTokensFailure(error);
        }
      );
    }),
    createToken: web.createToken.handler(async ({ input, context }) => {
      const { userId, organizationId, actor } = context.request.authContext;
      const result = await deps.tokenHandlers.create({
        actor,
        userId,
        organizationId,
        name: input.name,
      });
      return result.match(
        ({ token, rawToken }) => ({ token, rawToken }),
        (error) => {
          throw createTokenFailure(error);
        }
      );
    }),
    deleteToken: web.deleteToken.handler(async ({ input, context }) => {
      const { userId, organizationId, actor } = context.request.authContext;
      const result = await deps.tokenHandlers.revoke({
        actor,
        tokenId: input.tokenId,
        userId,
        organizationId,
      });
      return result.match(
        () => ({ success: true as const }),
        (error) => {
          throw deleteTokenFailure(error);
        }
      );
    }),
  });
};

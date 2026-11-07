import type { FastifyInstance } from 'fastify';
import { OpenAPIHandler } from '@orpc/openapi/fastify';
import { implement } from '@orpc/server';
import {
  BOT_CANNOT_CHANGE_ROLES_MESSAGE,
  THERE_HAS_TO_BE_AT_LEAST_ONE_ADMIN_MESSAGE,
  CANNOT_CHANGE_OWN_ROLE_MESSAGE,
  CANNOT_REMOVE_SELF_MESSAGE,
  CHANGE_ROLE_STORAGE_MESSAGE,
  HANDOVER_OWNERSHIP_PATH,
  OWNER_ROLE_LOCKED_MESSAGE,
  REISSUE_NOT_ALLOWED_MESSAGE,
  REISSUE_TOKEN_STORAGE_MESSAGE,
  REMOVE_NOT_ALLOWED_MESSAGE,
  ROLE_CHANGE_NOT_ALLOWED_MESSAGE,
  TRANSFER_OWNERSHIP_STORAGE_MESSAGE,
  removeMemberFailedMessage,
} from '@yoink/api-contracts';
import { organizationOrpcContract } from '@yoink/api-contracts/orpc';
import type { SessionService } from '../domain/session-service.js';
import type { MembershipService } from '../domain/membership-service.js';
import type { UserService } from '../domain/user-service.js';
import type { AgentService, AgentServiceError } from '../domain/agent-service.js';
import type { AuthMiddleware } from './auth-middleware.js';
import type { ReissueAgentToken, ReissueAgentTokenError } from './handle-reissue-agent-token.js';
import type {
  HandleTransferOwnershipError,
  TransferOwnershipHandler,
} from './handle-transfer-ownership.js';
import type {
  ChangeMemberRoleHandler,
  HandleChangeMemberRoleError,
} from './handle-change-member-role.js';
import type {
  HandleRemoveMemberError,
  RemoveMemberHandler,
} from './handle-remove-member.js';
import { principalKindOf } from '../domain/user.js';
import type { SessionServiceError } from '../domain/auth-errors.js';
import type { MembershipServiceError } from '../domain/organization-errors.js';
import type { UserServiceError } from '../domain/user-errors.js';
import { dispatchOrpc } from '../../edges/_shared/orpc/dispatch.js';
import { yoinkOpenApiHandlerOptions } from '../../edges/_shared/orpc/handler-options.js';
import type { OrpcHttpContext } from '../../edges/_shared/orpc/http-context.js';
import { accessHttpError, accessStorageError } from './access-http-errors.js';

const leaveErrorResponse = (error: HandleRemoveMemberError) => {
  switch (error.type) {
    case 'MEMBERSHIP_NOT_FOUND':
      return accessHttpError({
        code: 'NOT_FOUND',
        message: 'Not a member of this organization',
        bodyCode: error.type,
      });
    case 'CANNOT_LEAVE_PERSONAL_ORG':
      return accessHttpError({
        code: 'BAD_REQUEST',
        message: 'Cannot leave your personal organization',
        bodyCode: error.type,
      });
    case 'LAST_ADMIN':
      return accessHttpError({
        code: 'BAD_REQUEST',
        message: 'Cannot leave as the last admin',
        bodyCode: error.type,
      });
    case 'OWNER_MUST_TRANSFER':
      return accessHttpError({
        code: 'CONFLICT',
        message: error.message,
        bodyCode: error.type,
        handoverPath: HANDOVER_OWNERSHIP_PATH,
      });
    case 'MEMBER_REMOVE_FAILED':
      return accessStorageError(error.cause, 'Failed to leave organization');
    case 'OWNER_CANNOT_BE_REMOVED':
    case 'CANNOT_REMOVE_SELF':
    case 'REMOVE_NOT_ALLOWED':
    case 'USER_NOT_FOUND':
    case 'USER_STORAGE_ERROR':
      return accessStorageError(error, 'Failed to leave organization');
    default: {
      const _never: never = error;
      return accessStorageError(_never, 'Failed to leave organization');
    }
  }
};

const removeMemberErrorResponse = (error: HandleRemoveMemberError) => {
  switch (error.type) {
    case 'MEMBERSHIP_NOT_FOUND':
      return accessHttpError({
        code: 'NOT_FOUND',
        message: 'Member not found',
        bodyCode: error.type,
      });
    case 'CANNOT_REMOVE_SELF':
      return accessHttpError({
        code: 'BAD_REQUEST',
        message: CANNOT_REMOVE_SELF_MESSAGE,
        bodyCode: error.type,
      });
    case 'CANNOT_LEAVE_PERSONAL_ORG':
      return accessHttpError({
        code: 'BAD_REQUEST',
        message: 'Cannot remove a member from a personal workspace',
        bodyCode: error.type,
      });
    case 'OWNER_CANNOT_BE_REMOVED':
      return accessHttpError({
        code: 'CONFLICT',
        message: error.message,
        bodyCode: error.type,
      });
    case 'REMOVE_NOT_ALLOWED':
      return accessHttpError({
        code: 'FORBIDDEN',
        message: REMOVE_NOT_ALLOWED_MESSAGE,
        bodyCode: error.type,
      });
    case 'LAST_ADMIN':
      return accessHttpError({
        code: 'BAD_REQUEST',
        message: 'Cannot remove the last admin',
        bodyCode: error.type,
      });
    case 'OWNER_MUST_TRANSFER':
      return accessHttpError({
        code: 'CONFLICT',
        message: error.message,
        bodyCode: error.type,
      });
    case 'MEMBER_REMOVE_FAILED':
      return accessStorageError(error.cause, removeMemberFailedMessage(error.memberName));
    case 'USER_NOT_FOUND':
    case 'USER_STORAGE_ERROR':
      return accessStorageError(error, removeMemberFailedMessage('member'));
    default: {
      const _never: never = error;
      return accessStorageError(_never, removeMemberFailedMessage('member'));
    }
  }
};

const changeMemberRoleErrorResponse = (
  error: HandleChangeMemberRoleError,
  callerUserId: string
) => {
  switch (error.type) {
    case 'BOT_CANNOT_CHANGE_ROLES':
      return accessHttpError({
        code: 'FORBIDDEN',
        message: BOT_CANNOT_CHANGE_ROLES_MESSAGE,
        bodyCode: error.type,
      });
    case 'MEMBERSHIP_NOT_FOUND':
      if (error.userId === callerUserId) {
        return accessHttpError({
          code: 'FORBIDDEN',
          message: 'Not a member of this organization',
          bodyCode: error.type,
        });
      }
      return accessHttpError({
        code: 'NOT_FOUND',
        message: 'Member not found',
        bodyCode: error.type,
      });
    case 'ROLE_CHANGE_NOT_ALLOWED':
      return accessHttpError({
        code: 'FORBIDDEN',
        message: ROLE_CHANGE_NOT_ALLOWED_MESSAGE,
        bodyCode: error.type,
      });
    case 'CANNOT_CHANGE_OWN_ROLE':
      return accessHttpError({
        code: 'BAD_REQUEST',
        message: CANNOT_CHANGE_OWN_ROLE_MESSAGE,
        bodyCode: error.type,
      });
    case 'OWNER_ROLE_LOCKED':
      return accessHttpError({
        code: 'CONFLICT',
        message: OWNER_ROLE_LOCKED_MESSAGE,
        bodyCode: error.type,
      });
    case 'CANNOT_ASSIGN_OWNER_ROLE':
    case 'BOT_CANNOT_HAVE_PRIVILEGED_ROLE':
      return accessHttpError({
        code: 'BAD_REQUEST',
        message: error.message,
        bodyCode: error.type,
      });
    case 'LAST_ADMIN':
      return accessHttpError({
        code: 'CONFLICT',
        message: THERE_HAS_TO_BE_AT_LEAST_ONE_ADMIN_MESSAGE,
        bodyCode: error.type,
      });
    case 'OWNER_MUST_TRANSFER':
      return accessHttpError({
        code: 'CONFLICT',
        message: error.message,
        bodyCode: error.type,
      });
    case 'USER_NOT_FOUND':
      return accessHttpError({
        code: 'NOT_FOUND',
        message: 'Member not found',
        bodyCode: error.type,
      });
    case 'MEMBERSHIP_STORAGE_ERROR':
    case 'USER_STORAGE_ERROR':
      return accessStorageError(error, CHANGE_ROLE_STORAGE_MESSAGE);
    default: {
      const _never: never = error;
      return accessStorageError(_never, CHANGE_ROLE_STORAGE_MESSAGE);
    }
  }
};

const reissueAgentTokenErrorResponse = (
  error: ReissueAgentTokenError,
  callerUserId: string
) => {
  switch (error.type) {
    case 'BOT_CANNOT_MANAGE_TOKENS':
      return accessHttpError({
        code: 'FORBIDDEN',
        message: error.message,
        bodyCode: error.type,
      });
    case 'INVALID_TOKEN_NAME':
      return accessHttpError({
        code: 'BAD_REQUEST',
        message: error.message,
        bodyCode: error.type,
      });
    case 'REISSUE_NOT_ALLOWED':
      return accessHttpError({
        code: 'FORBIDDEN',
        message: REISSUE_NOT_ALLOWED_MESSAGE,
        bodyCode: error.type,
      });
    case 'MEMBERSHIP_NOT_FOUND':
      if (error.userId === callerUserId) {
        return accessHttpError({
          code: 'FORBIDDEN',
          message: 'Not a member of this organization',
          bodyCode: error.type,
        });
      }
      return accessHttpError({
        code: 'NOT_FOUND',
        message: 'Agent member not found',
        bodyCode: error.type,
      });
    case 'MEMBERSHIP_STORAGE_ERROR':
    case 'USER_STORAGE_ERROR':
    case 'TOKEN_STORAGE_ERROR':
    case 'USER_NOT_FOUND':
      return accessStorageError(
        error,
        REISSUE_TOKEN_STORAGE_MESSAGE,
        'Failed to reissue agent token'
      );
    default: {
      const _never: never = error;
      return accessStorageError(
        _never,
        REISSUE_TOKEN_STORAGE_MESSAGE,
        'Failed to reissue agent token'
      );
    }
  }
};

const transferOwnershipErrorResponse = (error: HandleTransferOwnershipError) => {
  switch (error.type) {
    case 'BOT_CANNOT_TRANSFER_OWNERSHIP':
      return accessHttpError({
        code: 'FORBIDDEN',
        message: error.message,
        bodyCode: error.type,
      });
    case 'NOT_CURRENT_OWNER':
      return accessHttpError({
        code: 'FORBIDDEN',
        message: error.message,
        bodyCode: error.type,
      });
    case 'PERSONAL_WORKSPACE_TRANSFER':
      return accessHttpError({
        code: 'BAD_REQUEST',
        message: error.message,
        bodyCode: error.type,
      });
    case 'ALREADY_OWNER':
      return accessHttpError({
        code: 'BAD_REQUEST',
        message: error.message,
        bodyCode: error.type,
      });
    case 'USER_NOT_FOUND':
      return accessHttpError({
        code: 'NOT_FOUND',
        message: 'User not found',
        bodyCode: error.type,
      });
    case 'BOT_CANNOT_HAVE_PRIVILEGED_ROLE':
      return accessHttpError({
        code: 'BAD_REQUEST',
        message: error.message,
        bodyCode: error.type,
      });
    case 'TARGET_NOT_WORKSPACE_MEMBER':
      return accessHttpError({
        code: 'BAD_REQUEST',
        message: error.message,
        bodyCode: error.type,
      });
    case 'OWNER_MUST_TRANSFER':
      return accessHttpError({
        code: 'CONFLICT',
        message: error.message,
        bodyCode: error.type,
        handoverPath: HANDOVER_OWNERSHIP_PATH,
      });
    case 'MEMBERSHIP_STORAGE_ERROR':
    case 'USER_STORAGE_ERROR':
      return accessStorageError(error, TRANSFER_OWNERSHIP_STORAGE_MESSAGE);
    default: {
      const _never: never = error;
      return accessStorageError(_never, TRANSFER_OWNERSHIP_STORAGE_MESSAGE);
    }
  }
};

const switchOrganizationFailure = (error: SessionServiceError, organizationId: string) => {
  switch (error.type) {
    case 'NOT_A_MEMBER':
      return accessHttpError({
        code: 'BAD_REQUEST',
        message: `User is not a member of organization ${organizationId}`,
      });
    case 'SESSION_NOT_FOUND':
      return accessHttpError({ code: 'UNAUTHORIZED', message: 'Session not found' });
    case 'USER_NOT_FOUND':
    case 'NO_MEMBERSHIPS':
    case 'SESSION_STORAGE_ERROR':
    case 'USER_STORAGE_ERROR':
    case 'ALREADY_MEMBER':
    case 'MEMBERSHIP_NOT_FOUND':
    case 'CANNOT_LEAVE_PERSONAL_ORG':
    case 'CANNOT_ASSIGN_OWNER_ROLE':
    case 'OWNER_MUST_TRANSFER':
    case 'OWNER_CANNOT_BE_REMOVED':
    case 'NOT_CURRENT_OWNER':
    case 'BOT_CANNOT_TRANSFER_OWNERSHIP':
    case 'PERSONAL_WORKSPACE_TRANSFER':
    case 'ALREADY_OWNER':
    case 'SECOND_OWNER':
    case 'BOT_CANNOT_HAVE_PRIVILEGED_ROLE':
    case 'TARGET_NOT_WORKSPACE_MEMBER':
    case 'LAST_ADMIN':
    case 'INSUFFICIENT_PERMISSIONS':
    case 'BOT_CANNOT_CHANGE_ROLES':
    case 'ROLE_CHANGE_NOT_ALLOWED':
    case 'CANNOT_CHANGE_OWN_ROLE':
    case 'OWNER_ROLE_LOCKED':
    case 'CANNOT_REMOVE_SELF':
    case 'REMOVE_NOT_ALLOWED':
    case 'REISSUE_NOT_ALLOWED':
    case 'ORGANIZATION_NOT_FOUND':
    case 'MEMBERSHIP_STORAGE_ERROR':
    case 'ORGANIZATION_STORAGE_ERROR':
      return accessStorageError(error, 'Failed to switch organization');
    default: {
      const _never: never = error;
      return accessStorageError(_never, 'Failed to switch organization');
    }
  }
};

const membershipFailure = (error: MembershipServiceError, message: string) => {
  switch (error.type) {
    case 'ALREADY_MEMBER':
    case 'MEMBERSHIP_NOT_FOUND':
    case 'CANNOT_LEAVE_PERSONAL_ORG':
    case 'CANNOT_ASSIGN_OWNER_ROLE':
    case 'OWNER_MUST_TRANSFER':
    case 'OWNER_CANNOT_BE_REMOVED':
    case 'NOT_CURRENT_OWNER':
    case 'BOT_CANNOT_TRANSFER_OWNERSHIP':
    case 'PERSONAL_WORKSPACE_TRANSFER':
    case 'ALREADY_OWNER':
    case 'SECOND_OWNER':
    case 'BOT_CANNOT_HAVE_PRIVILEGED_ROLE':
    case 'TARGET_NOT_WORKSPACE_MEMBER':
    case 'LAST_ADMIN':
    case 'INSUFFICIENT_PERMISSIONS':
    case 'BOT_CANNOT_CHANGE_ROLES':
    case 'ROLE_CHANGE_NOT_ALLOWED':
    case 'CANNOT_CHANGE_OWN_ROLE':
    case 'OWNER_ROLE_LOCKED':
    case 'CANNOT_REMOVE_SELF':
    case 'REMOVE_NOT_ALLOWED':
    case 'REISSUE_NOT_ALLOWED':
    case 'USER_NOT_FOUND':
    case 'ORGANIZATION_NOT_FOUND':
    case 'MEMBERSHIP_STORAGE_ERROR':
    case 'ORGANIZATION_STORAGE_ERROR':
    case 'USER_STORAGE_ERROR':
      return accessStorageError(error, message);
    default: {
      const _never: never = error;
      return accessStorageError(_never, message);
    }
  }
};

const userFailure = (error: UserServiceError, message: string) => {
  switch (error.type) {
    case 'USER_NOT_FOUND':
    case 'USER_STORAGE_ERROR':
      return accessStorageError(error, message);
    default: {
      const _never: never = error;
      return accessStorageError(_never, message);
    }
  }
};

const mintAgentFailure = (error: AgentServiceError) => {
  switch (error.type) {
    case 'MEMBERSHIP_NOT_FOUND':
      return accessHttpError({
        code: 'FORBIDDEN',
        message: 'Not a member of this organization',
      });
    case 'INSUFFICIENT_PERMISSIONS':
      return accessHttpError({
        code: 'FORBIDDEN',
        message: 'Only owners and admins can mint agents',
      });
    case 'BOT_CANNOT_MANAGE_TOKENS':
      return accessHttpError({ code: 'FORBIDDEN', message: error.message });
    case 'INVALID_TOKEN_NAME':
      return accessHttpError({ code: 'BAD_REQUEST', message: error.message });
    case 'ORGANIZATION_NOT_FOUND':
      return accessHttpError({ code: 'NOT_FOUND', message: 'Organization not found' });
    case 'ALREADY_MEMBER':
    case 'CANNOT_LEAVE_PERSONAL_ORG':
    case 'CANNOT_ASSIGN_OWNER_ROLE':
    case 'OWNER_MUST_TRANSFER':
    case 'OWNER_CANNOT_BE_REMOVED':
    case 'NOT_CURRENT_OWNER':
    case 'BOT_CANNOT_TRANSFER_OWNERSHIP':
    case 'PERSONAL_WORKSPACE_TRANSFER':
    case 'ALREADY_OWNER':
    case 'SECOND_OWNER':
    case 'BOT_CANNOT_HAVE_PRIVILEGED_ROLE':
    case 'TARGET_NOT_WORKSPACE_MEMBER':
    case 'LAST_ADMIN':
    case 'BOT_CANNOT_CHANGE_ROLES':
    case 'ROLE_CHANGE_NOT_ALLOWED':
    case 'CANNOT_CHANGE_OWN_ROLE':
    case 'OWNER_ROLE_LOCKED':
    case 'CANNOT_REMOVE_SELF':
    case 'REMOVE_NOT_ALLOWED':
    case 'REISSUE_NOT_ALLOWED':
    case 'USER_NOT_FOUND':
    case 'MEMBERSHIP_STORAGE_ERROR':
    case 'ORGANIZATION_STORAGE_ERROR':
    case 'USER_STORAGE_ERROR':
    case 'TOKEN_LIMIT_REACHED':
    case 'TOKEN_OWNERSHIP_ERROR':
    case 'TOKEN_STORAGE_ERROR':
      return accessStorageError(error, 'Failed to mint agent');
    default: {
      const _never: never = error;
      return accessStorageError(_never, 'Failed to mint agent');
    }
  }
};

export type OrganizationRoutesDependencies = {
  sessionService: SessionService;
  membershipService: MembershipService;
  userService: UserService;
  agentService: AgentService;
  reissueAgentToken: ReissueAgentToken;
  transferOwnership: TransferOwnershipHandler;
  changeMemberRole: ChangeMemberRoleHandler;
  removeMember: RemoveMemberHandler;
  authMiddleware: AuthMiddleware;
};

export const registerOrganizationRoutes = async (
  app: FastifyInstance,
  deps: OrganizationRoutesDependencies
) => {
  const {
    sessionService,
    membershipService,
    userService,
    agentService,
    reissueAgentToken,
    transferOwnership,
    changeMemberRole,
    removeMember,
    authMiddleware,
  } = deps;

  const organizations = implement(organizationOrpcContract).$context<OrpcHttpContext>();
  const organizationRouter = organizations.router({
    switch: organizations.switch.handler(async ({ input, context }) => {
      const session = context.request.userSession;
      if (!session) {
        throw accessHttpError({
          code: 'BAD_REQUEST',
          message: 'Organization switching requires session authentication (not token)',
        });
      }

      const result = await sessionService.switchOrganization(session.id, input.organizationId);
      return result.match(
        () => ({ success: true as const }),
        (error) => {
          throw switchOrganizationFailure(error, input.organizationId);
        }
      );
    }),
    transferOwner: organizations.transferOwner.handler(async ({ input, context }) => {
      const result = await transferOwnership({
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
    leave: organizations.leave.handler(async ({ input, context }) => {
      const session = context.request.userSession;
      if (!session) {
        throw accessHttpError({ code: 'UNAUTHORIZED', message: 'Authentication required' });
      }

      const result = await removeMember({
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
    listMembers: organizations.listMembers.handler(async ({ input, context }) => {
      const { userId } = context.request.authContext;
      const membershipResult = await membershipService.getMembership({
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

      const membersResult = await membershipService.listMemberships({
        organizationId: input.organizationId,
      });
      if (membersResult.isErr()) {
        throw membershipFailure(membersResult.error, 'Failed to list members');
      }

      const usersResult = await userService.getUsersByIds(
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
    changeMemberRole: organizations.changeMemberRole.handler(async ({ input, context }) => {
      const result = await changeMemberRole({
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
    removeMember: organizations.removeMember.handler(async ({ input, context }) => {
      const session = context.request.userSession;
      if (!session) {
        throw accessHttpError({ code: 'UNAUTHORIZED', message: 'Authentication required' });
      }

      const result = await removeMember({
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
    createAgent: organizations.createAgent.handler(async ({ input, context }) => {
      const result = await agentService.mintAgent({
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
    reissueAgentToken: organizations.reissueAgentToken.handler(async ({ input, context }) => {
      const result = await reissueAgentToken({
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
  });

  const handler = new OpenAPIHandler(organizationRouter, yoinkOpenApiHandlerOptions);

  await app.register(async (orgApp) => {
    orgApp.addHook('preHandler', authMiddleware);

    const mount = (
      method: 'GET' | 'POST' | 'PATCH' | 'DELETE' | Array<'GET' | 'POST' | 'PATCH' | 'DELETE'>,
      url: string
    ) => {
      orgApp.route({
        method,
        url,
        handler: async (request, reply) => dispatchOrpc(handler, request, reply),
      });
    };

    mount('POST', '/api/organizations/switch');
    mount('POST', '/api/organizations/:organizationId/leave');
    mount('POST', '/api/organizations/:organizationId/owner/transfer');
    mount('GET', '/api/organizations/:organizationId/members');
    mount('PATCH', '/api/organizations/:organizationId/members/:userId/role');
    mount('DELETE', '/api/organizations/:organizationId/members/:userId');
    mount('POST', '/api/organizations/:organizationId/agents');
    mount('POST', '/api/organizations/:organizationId/members/:userId/token');
  });
};

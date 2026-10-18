import type { FastifyInstance } from 'fastify';
import { initServer } from '@ts-rest/fastify';
import {
  BOT_CANNOT_CHANGE_ROLES_MESSAGE,
  CANNOT_CHANGE_LAST_ADMIN_MESSAGE,
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
  organizationContract,
  removeMemberFailedMessage,
} from '@yoink/api-contracts';
import type { SessionService } from '../domain/session-service.js';
import type { MembershipService } from '../domain/membership-service.js';
import type { UserService } from '../domain/user-service.js';
import type { AgentService } from '../domain/agent-service.js';
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
import { namedRequestValidationError } from '../../shared/request-validation.js';

const storageFailure = (message: string) => ({
  status: 500 as const,
  body: { message },
});

const leaveErrorResponse = (error: HandleRemoveMemberError) => {
  switch (error.type) {
    case 'MEMBERSHIP_NOT_FOUND':
      return {
        status: 404 as const,
        body: { message: 'Not a member of this organization', code: error.type },
      };
    case 'CANNOT_LEAVE_PERSONAL_ORG':
      return {
        status: 400 as const,
        body: { message: 'Cannot leave your personal organization', code: error.type },
      };
    case 'LAST_ADMIN':
      return {
        status: 400 as const,
        body: { message: 'Cannot leave as the last admin', code: error.type },
      };
    case 'OWNER_MUST_TRANSFER':
      return {
        status: 409 as const,
        body: {
          message: error.message,
          code: error.type,
          handoverPath: HANDOVER_OWNERSHIP_PATH,
        },
      };
    case 'OWNER_CANNOT_BE_REMOVED':
    case 'CANNOT_REMOVE_SELF':
    case 'REMOVE_NOT_ALLOWED':
    case 'MEMBER_REMOVE_FAILED':
    case 'USER_NOT_FOUND':
    case 'USER_STORAGE_ERROR':
      return storageFailure('Failed to leave organization');
    default: {
      const _never: never = error;
      void _never;
      return storageFailure('Failed to leave organization');
    }
  }
};

const removeMemberErrorResponse = (error: HandleRemoveMemberError) => {
  switch (error.type) {
    case 'MEMBERSHIP_NOT_FOUND':
      return {
        status: 404 as const,
        body: { message: 'Member not found', code: error.type },
      };
    case 'CANNOT_REMOVE_SELF':
      return {
        status: 400 as const,
        body: { message: CANNOT_REMOVE_SELF_MESSAGE, code: error.type },
      };
    case 'CANNOT_LEAVE_PERSONAL_ORG':
      return {
        status: 400 as const,
        body: { message: 'Cannot remove a member from a personal workspace', code: error.type },
      };
    case 'OWNER_CANNOT_BE_REMOVED':
      return {
        status: 409 as const,
        body: { message: error.message, code: error.type },
      };
    case 'REMOVE_NOT_ALLOWED':
      return {
        status: 403 as const,
        body: { message: REMOVE_NOT_ALLOWED_MESSAGE, code: error.type },
      };
    case 'LAST_ADMIN':
      return {
        status: 400 as const,
        body: { message: 'Cannot remove the last admin', code: error.type },
      };
    case 'OWNER_MUST_TRANSFER':
      return {
        status: 409 as const,
        body: { message: error.message, code: error.type },
      };
    case 'MEMBER_REMOVE_FAILED':
      return storageFailure(removeMemberFailedMessage(error.memberName));
    case 'USER_NOT_FOUND':
    case 'USER_STORAGE_ERROR':
      return storageFailure(removeMemberFailedMessage('member'));
    default: {
      const _never: never = error;
      void _never;
      return storageFailure(removeMemberFailedMessage('member'));
    }
  }
};

const changeMemberRoleErrorResponse = (
  error: HandleChangeMemberRoleError,
  callerUserId: string
) => {
  switch (error.type) {
    case 'BOT_CANNOT_CHANGE_ROLES':
      return {
        status: 403 as const,
        body: { message: BOT_CANNOT_CHANGE_ROLES_MESSAGE, code: error.type },
      };
    case 'MEMBERSHIP_NOT_FOUND':
      if (error.userId === callerUserId) {
        return {
          status: 403 as const,
          body: { message: 'Not a member of this organization', code: error.type },
        };
      }
      return {
        status: 404 as const,
        body: { message: 'Member not found', code: error.type },
      };
    case 'ROLE_CHANGE_NOT_ALLOWED':
      return {
        status: 403 as const,
        body: { message: ROLE_CHANGE_NOT_ALLOWED_MESSAGE, code: error.type },
      };
    case 'CANNOT_CHANGE_OWN_ROLE':
      return {
        status: 400 as const,
        body: { message: CANNOT_CHANGE_OWN_ROLE_MESSAGE, code: error.type },
      };
    case 'OWNER_ROLE_LOCKED':
      return {
        status: 409 as const,
        body: { message: OWNER_ROLE_LOCKED_MESSAGE, code: error.type },
      };
    case 'CANNOT_ASSIGN_OWNER_ROLE':
    case 'BOT_CANNOT_HAVE_PRIVILEGED_ROLE':
      return {
        status: 400 as const,
        body: { message: error.message, code: error.type },
      };
    case 'LAST_ADMIN':
      return {
        status: 409 as const,
        body: { message: CANNOT_CHANGE_LAST_ADMIN_MESSAGE, code: error.type },
      };
    case 'OWNER_MUST_TRANSFER':
      return {
        status: 409 as const,
        body: { message: error.message, code: error.type },
      };
    case 'USER_NOT_FOUND':
      return {
        status: 404 as const,
        body: { message: 'Member not found', code: error.type },
      };
    case 'MEMBERSHIP_STORAGE_ERROR':
    case 'USER_STORAGE_ERROR':
      return {
        status: 500 as const,
        body: { message: CHANGE_ROLE_STORAGE_MESSAGE },
      };
    default: {
      const _never: never = error;
      void _never;
      return {
        status: 500 as const,
        body: { message: CHANGE_ROLE_STORAGE_MESSAGE },
      };
    }
  }
};

const reissueAgentTokenErrorResponse = (
  error: ReissueAgentTokenError,
  callerUserId: string
) => {
  switch (error.type) {
    case 'BOT_CANNOT_MANAGE_TOKENS':
      return {
        status: 403 as const,
        body: { message: error.message, code: error.type },
      };
    case 'INVALID_TOKEN_NAME':
      return {
        status: 400 as const,
        body: { message: error.message, code: error.type },
      };
    case 'REISSUE_NOT_ALLOWED':
      return {
        status: 403 as const,
        body: { message: REISSUE_NOT_ALLOWED_MESSAGE, code: error.type },
      };
    case 'MEMBERSHIP_NOT_FOUND':
      if (error.userId === callerUserId) {
        return {
          status: 403 as const,
          body: { message: 'Not a member of this organization', code: error.type },
        };
      }
      return {
        status: 404 as const,
        body: { message: 'Agent member not found', code: error.type },
      };
    case 'MEMBERSHIP_STORAGE_ERROR':
    case 'USER_STORAGE_ERROR':
    case 'TOKEN_STORAGE_ERROR':
    case 'USER_NOT_FOUND':
      return {
        status: 500 as const,
        body: { message: REISSUE_TOKEN_STORAGE_MESSAGE },
      };
    default: {
      const _never: never = error;
      void _never;
      return {
        status: 500 as const,
        body: { message: REISSUE_TOKEN_STORAGE_MESSAGE },
      };
    }
  }
};

const transferOwnershipErrorResponse = (error: HandleTransferOwnershipError) => {
  switch (error.type) {
    case 'BOT_CANNOT_TRANSFER_OWNERSHIP':
      return {
        status: 403 as const,
        body: { message: error.message, code: error.type },
      };
    case 'NOT_CURRENT_OWNER':
      return {
        status: 403 as const,
        body: { message: error.message, code: error.type },
      };
    case 'PERSONAL_WORKSPACE_TRANSFER':
      return {
        status: 400 as const,
        body: { message: error.message, code: error.type },
      };
    case 'ALREADY_OWNER':
      return {
        status: 400 as const,
        body: { message: error.message, code: error.type },
      };
    case 'USER_NOT_FOUND':
      return {
        status: 404 as const,
        body: { message: 'User not found', code: error.type },
      };
    case 'BOT_CANNOT_HAVE_PRIVILEGED_ROLE':
      return {
        status: 400 as const,
        body: { message: error.message, code: error.type },
      };
    case 'TARGET_NOT_WORKSPACE_MEMBER':
      return {
        status: 400 as const,
        body: { message: error.message, code: error.type },
      };
    case 'OWNER_MUST_TRANSFER':
      return {
        status: 409 as const,
        body: {
          message: error.message,
          code: error.type,
          handoverPath: HANDOVER_OWNERSHIP_PATH,
        },
      };
    case 'MEMBERSHIP_STORAGE_ERROR':
    case 'USER_STORAGE_ERROR':
      return {
        status: 500 as const,
        body: { message: TRANSFER_OWNERSHIP_STORAGE_MESSAGE },
      };
    default: {
      const _never: never = error;
      void _never;
      return {
        status: 500 as const,
        body: { message: TRANSFER_OWNERSHIP_STORAGE_MESSAGE },
      };
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
  const s = initServer();

  await app.register(async (orgApp) => {
    // Apply combined auth middleware (supports both token and session auth)
    orgApp.addHook('preHandler', authMiddleware);

    const router = s.router(organizationContract, {
      switch: async ({ body, request }) => {
        const { organizationId } = body;
        const session = request.userSession;

        // Switch requires a session (not just token auth)
        if (!session) {
          return {
            status: 400 as const,
            body: { message: 'Organization switching requires session authentication (not token)' },
          };
        }

        const result = await sessionService.switchOrganization(session.id, organizationId);

        return result.match(
          () => ({
            status: 200 as const,
            body: { success: true as const },
          }),
          (error) => {
            if (error.type === 'NOT_A_MEMBER') {
              return {
                status: 400 as const,
                body: { message: `User is not a member of organization ${organizationId}` },
              };
            }
            if (error.type === 'SESSION_NOT_FOUND') {
              return {
                status: 401 as const,
                body: { message: 'Session not found' },
              };
            }
            return {
              status: 500 as const,
              body: { message: 'Failed to switch organization' },
            };
          }
        );
      },

      transferOwner: async ({ params, body, request }) => {
        const result = await transferOwnership({
          organizationId: params.organizationId,
          toUserId: body.userId,
          callerUserId: request.authContext.userId,
          actorKind: request.authContext.principalKind,
        });

        return result.match(
          (view) => ({
            status: 200 as const,
            body: view,
          }),
          (error) => transferOwnershipErrorResponse(error)
        );
      },

      leave: async ({ params, request }) => {
        const { organizationId } = params;
        const session = request.userSession;

        if (!session) {
          return {
            status: 401 as const,
            body: { message: 'Authentication required' },
          };
        }

        const result = await removeMember({
          organizationId,
          userId: session.userId,
          by: { kind: 'self' },
        });

        return result.match(
          () => ({
            status: 200 as const,
            body: { success: true as const },
          }),
          (error) => leaveErrorResponse(error)
        );
      },

      listMembers: async ({ params, request }) => {
        const { organizationId } = params;
        const { userId } = request.authContext;

        // Any authenticated org member (human or agent, token or session)
        // can view the roster — enough to pick a task assignee.
        const membershipResult = await membershipService.getMembership({
          userId,
          organizationId,
        });

        if (membershipResult.isErr()) {
          return {
            status: 500 as const,
            body: { message: 'Failed to check membership' },
          };
        }

        if (!membershipResult.value) {
          return {
            status: 403 as const,
            body: { message: 'Not a member of this organization' },
          };
        }

        // Get all members
        const membersResult = await membershipService.listMemberships({
          organizationId,
        });

        if (membersResult.isErr()) {
          return {
            status: 500 as const,
            body: { message: 'Failed to list members' },
          };
        }

        const memberships = membersResult.value;

        // Fetch user details for all members
        const userIds = memberships.map((m) => m.userId);
        const usersResult = await userService.getUsersByIds(userIds);

        if (usersResult.isErr()) {
          return {
            status: 500 as const,
            body: { message: 'Failed to fetch user details' },
          };
        }

        const usersById = new Map(usersResult.value.map((u) => [u.id, u]));

        // Combine membership and user data
        const members = memberships.map((m) => {
          const user = usersById.get(m.userId);
          return {
            userId: m.userId,
            email: user?.email ?? 'unknown',
            name: user?.name,
            kind: user ? principalKindOf(user) : 'human' as const,
            role: m.role,
            joinedAt: m.joinedAt,
          };
        });

        return {
          status: 200 as const,
          body: { members },
        };
      },

      changeMemberRole: async ({ params, body, request }) => {
        const result = await changeMemberRole({
          organizationId: params.organizationId,
          userId: params.userId,
          newRole: body.role,
          callerUserId: request.authContext.userId,
          callerVia: request.authContext.actor.via,
          principalKind: request.authContext.principalKind,
        });

        return result.match(
          (member) => ({
            status: 200 as const,
            body: { member },
          }),
          (error) => changeMemberRoleErrorResponse(error, request.authContext.userId)
        );
      },

      removeMember: async ({ params, request }) => {
        const { organizationId, userId: targetUserId } = params;
        const session = request.userSession;

        if (!session) {
          return {
            status: 401 as const,
            body: { message: 'Authentication required' },
          };
        }

        const result = await removeMember({
          organizationId,
          userId: targetUserId,
          by: { kind: 'member', userId: session.userId },
        });

        return result.match(
          () => ({
            status: 204 as const,
            body: undefined,
          }),
          (error) => removeMemberErrorResponse(error)
        );
      },

      createAgent: async ({ params, body, request }) => {
        const { organizationId } = params;

        const result = await agentService.mintAgent({
          actor: request.authContext.actor,
          organizationId,
          name: body.name,
        });

        return result.match(
          ({ user, membership, token, rawToken }) => ({
            status: 201 as const,
            body: {
              agent: {
                userId: user.id,
                name: user.name ?? body.name,
                kind: 'agent' as const,
                role: membership.role,
              },
              token,
              rawToken,
            },
          }),
          (error) => {
            if (error.type === 'MEMBERSHIP_NOT_FOUND') {
              return {
                status: 403 as const,
                body: { message: 'Not a member of this organization' },
              };
            }
            if (error.type === 'INSUFFICIENT_PERMISSIONS') {
              return {
                status: 403 as const,
                body: { message: 'Only owners and admins can mint agents' },
              };
            }
            if (error.type === 'BOT_CANNOT_MANAGE_TOKENS') {
              return {
                status: 403 as const,
                body: { message: error.message },
              };
            }
            if (error.type === 'INVALID_TOKEN_NAME') {
              return {
                status: 400 as const,
                body: { message: error.message },
              };
            }
            if (error.type === 'ORGANIZATION_NOT_FOUND') {
              return {
                status: 404 as const,
                body: { message: 'Organization not found' },
              };
            }
            request.log.error({ error }, 'Failed to mint agent');
            return {
              status: 500 as const,
              body: { message: 'Failed to mint agent' },
            };
          }
        );
      },

      reissueAgentToken: async ({ params, request }) => {
        const result = await reissueAgentToken({
          actor: request.authContext.actor,
          organizationId: params.organizationId,
          memberUserId: params.userId,
        });

        return result.match(
          ({ token, rawToken }) => ({
            status: 201 as const,
            body: { token, rawToken },
          }),
          (error) => reissueAgentTokenErrorResponse(error, request.authContext.actor.userId)
        );
      },
    });

    s.registerRouter(organizationContract, router, orgApp, {
      jsonQuery: true,
      responseValidation: true,
      requestValidationErrorHandler: (err, _request, reply) => {
        return reply.status(400).send(namedRequestValidationError(err));
      },
    });
  });
};

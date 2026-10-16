import type { FastifyInstance } from 'fastify';
import { initServer } from '@ts-rest/fastify';
import { organizationContract } from '@yoink/api-contracts';
import type { SessionService } from '../domain/session-service.js';
import type { MembershipService } from '../domain/membership-service.js';
import type { UserService } from '../domain/user-service.js';
import type { AgentService } from '../domain/agent-service.js';
import type { AuthMiddleware } from './auth-middleware.js';
import type { ReissueAgentToken } from './handle-reissue-agent-token.js';
import { principalKindOf } from '../domain/user.js';
import { namedRequestValidationError } from '../../shared/request-validation.js';
import type { MembershipServiceError } from '../domain/organization-errors.js';

const storageFailure = (message: string) => ({
  status: 500 as const,
  body: { message },
});

const leaveErrorResponse = (error: MembershipServiceError) => {
  switch (error.type) {
    case 'MEMBERSHIP_NOT_FOUND':
      return {
        status: 404 as const,
        body: { message: 'Not a member of this organization' },
      };
    case 'CANNOT_LEAVE_PERSONAL_ORG':
      return {
        status: 400 as const,
        body: { message: 'Cannot leave your personal organization' },
      };
    case 'LAST_ADMIN':
      return {
        status: 400 as const,
        body: { message: 'Cannot leave as the last admin' },
      };
    case 'OWNER_MUST_TRANSFER':
    case 'OWNER_CANNOT_BE_REMOVED':
      return {
        status: 409 as const,
        body: { message: error.message, code: error.type },
      };
    case 'INSUFFICIENT_PERMISSIONS':
    case 'ALREADY_MEMBER':
    case 'CANNOT_ASSIGN_OWNER_ROLE':
    case 'NOT_CURRENT_OWNER':
    case 'SECOND_OWNER':
    case 'BOT_CANNOT_HAVE_PRIVILEGED_ROLE':
    case 'TARGET_NOT_WORKSPACE_MEMBER':
    case 'USER_NOT_FOUND':
    case 'ORGANIZATION_NOT_FOUND':
    case 'MEMBERSHIP_STORAGE_ERROR':
    case 'ORGANIZATION_STORAGE_ERROR':
    case 'USER_STORAGE_ERROR':
      return storageFailure('Failed to leave organization');
    default: {
      const _never: never = error;
      void _never;
      return storageFailure('Failed to leave organization');
    }
  }
};

const removeMemberErrorResponse = (error: MembershipServiceError) => {
  switch (error.type) {
    case 'MEMBERSHIP_NOT_FOUND':
      return {
        status: 404 as const,
        body: { message: 'Member not found' },
      };
    case 'CANNOT_LEAVE_PERSONAL_ORG':
      return {
        status: 400 as const,
        body: { message: 'Cannot remove a member from a personal workspace' },
      };
    case 'LAST_ADMIN':
      return {
        status: 400 as const,
        body: { message: 'Cannot remove the last admin' },
      };
    case 'OWNER_MUST_TRANSFER':
    case 'OWNER_CANNOT_BE_REMOVED':
      return {
        status: 409 as const,
        body: { message: error.message, code: error.type },
      };
    case 'INSUFFICIENT_PERMISSIONS':
      return {
        status: 403 as const,
        body: { message: 'Insufficient permissions to remove members' },
      };
    case 'ALREADY_MEMBER':
    case 'CANNOT_ASSIGN_OWNER_ROLE':
    case 'NOT_CURRENT_OWNER':
    case 'SECOND_OWNER':
    case 'BOT_CANNOT_HAVE_PRIVILEGED_ROLE':
    case 'TARGET_NOT_WORKSPACE_MEMBER':
    case 'USER_NOT_FOUND':
    case 'ORGANIZATION_NOT_FOUND':
    case 'MEMBERSHIP_STORAGE_ERROR':
    case 'ORGANIZATION_STORAGE_ERROR':
    case 'USER_STORAGE_ERROR':
      return storageFailure('Failed to remove member');
    default: {
      const _never: never = error;
      void _never;
      return storageFailure('Failed to remove member');
    }
  }
};

export type OrganizationRoutesDependencies = {
  sessionService: SessionService;
  membershipService: MembershipService;
  userService: UserService;
  agentService: AgentService;
  reissueAgentToken: ReissueAgentToken;
  authMiddleware: AuthMiddleware;
};

export const registerOrganizationRoutes = async (
  app: FastifyInstance,
  deps: OrganizationRoutesDependencies
) => {
  const { sessionService, membershipService, userService, agentService, reissueAgentToken, authMiddleware } = deps;
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

      leave: async ({ params, request }) => {
        const { organizationId } = params;
        const session = request.userSession;

        if (!session) {
          return {
            status: 401 as const,
            body: { message: 'Authentication required' },
          };
        }

        const result = await membershipService.removeMember({
          organizationId,
          userId: session.userId,
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

      removeMember: async ({ params, request }) => {
        const { organizationId, userId: targetUserId } = params;
        const session = request.userSession;

        if (!session) {
          return {
            status: 401 as const,
            body: { message: 'Authentication required' },
          };
        }

        if (targetUserId === session.userId) {
          return {
            status: 400 as const,
            body: { message: 'Cannot remove yourself. Use leave instead.' },
          };
        }

        const result = await membershipService.removeMember({
          organizationId,
          userId: targetUserId,
          actorUserId: session.userId,
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
          (error) => {
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
            if (error.type === 'INSUFFICIENT_PERMISSIONS') {
              return {
                status: 403 as const,
                body: { message: 'Only the owner can issue a new agent token' },
              };
            }
            if (error.type === 'MEMBERSHIP_NOT_FOUND') {
              if (error.userId === request.authContext.actor.userId) {
                return {
                  status: 403 as const,
                  body: { message: 'Not a member of this organization' },
                };
              }
              return {
                status: 404 as const,
                body: { message: 'Agent member not found' },
              };
            }
            request.log.error({ error }, 'Failed to reissue agent token');
            return {
              status: 500 as const,
              body: { message: 'Failed to reissue agent token' },
            };
          }
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

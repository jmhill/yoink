import type { FastifyInstance } from 'fastify';
import { initServer } from '@ts-rest/fastify';
import { organizationContract } from '@yoink/api-contracts';
import type { SessionService } from '../../auth/domain/session-service.js';
import type { MembershipService } from '../domain/membership-service.js';
import type { UserService } from '../../users/domain/user-service.js';
import type { AuthMiddleware } from '../../auth/application/auth-middleware.js';

export type OrganizationRoutesDependencies = {
  sessionService: SessionService;
  membershipService: MembershipService;
  userService: UserService;
  authMiddleware: AuthMiddleware;
};

export const registerOrganizationRoutes = async (
  app: FastifyInstance,
  deps: OrganizationRoutesDependencies
) => {
  const { sessionService, membershipService, userService, authMiddleware } = deps;
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
          (error) => {
            if (error.type === 'MEMBERSHIP_NOT_FOUND') {
              return {
                status: 404 as const,
                body: { message: 'Not a member of this organization' },
              };
            }
            if (error.type === 'CANNOT_LEAVE_PERSONAL_ORG') {
              return {
                status: 400 as const,
                body: { message: 'Cannot leave your personal organization' },
              };
            }
            if (error.type === 'LAST_ADMIN') {
              return {
                status: 400 as const,
                body: { message: 'Cannot leave as the last admin. Transfer ownership first.' },
              };
            }
            return {
              status: 500 as const,
              body: { message: 'Failed to leave organization' },
            };
          }
        );
      },

      listMembers: async ({ params, request }) => {
        const { organizationId } = params;
        const session = request.userSession;

        if (!session) {
          return {
            status: 401 as const,
            body: { message: 'Authentication required' },
          };
        }

        // Check if user is a member of this organization
        const membershipResult = await membershipService.getMembership({
          userId: session.userId,
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

        // Cannot remove self - use leave instead
        if (targetUserId === session.userId) {
          return {
            status: 400 as const,
            body: { message: 'Cannot remove yourself. Use leave instead.' },
          };
        }

        // Get caller's membership to check permissions
        const callerMembershipResult = await membershipService.getMembership({
          userId: session.userId,
          organizationId,
        });

        if (callerMembershipResult.isErr()) {
          return {
            status: 500 as const,
            body: { message: 'Failed to check membership' },
          };
        }

        const callerMembership = callerMembershipResult.value;
        if (!callerMembership) {
          return {
            status: 403 as const,
            body: { message: 'Not a member of this organization' },
          };
        }

        // Get target's membership
        const targetMembershipResult = await membershipService.getMembership({
          userId: targetUserId,
          organizationId,
        });

        if (targetMembershipResult.isErr()) {
          return {
            status: 500 as const,
            body: { message: 'Failed to check target membership' },
          };
        }

        const targetMembership = targetMembershipResult.value;
        if (!targetMembership) {
          return {
            status: 404 as const,
            body: { message: 'User is not a member of this organization' },
          };
        }

        // Permission checks:
        // - owner can remove anyone (except themselves, already checked)
        // - admin can only remove members (not other admins)
        // - member cannot remove anyone
        const callerRole = callerMembership.role;
        const targetRole = targetMembership.role;

        if (callerRole === 'member') {
          return {
            status: 403 as const,
            body: { message: 'Insufficient permissions to remove members' },
          };
        }

        if (callerRole === 'admin' && (targetRole === 'admin' || targetRole === 'owner')) {
          return {
            status: 403 as const,
            body: { message: 'Admins can only remove members, not other admins or owners' },
          };
        }

        // Perform removal
        const result = await membershipService.removeMember({
          organizationId,
          userId: targetUserId,
        });

        return result.match(
          () => ({
            status: 204 as const,
            body: undefined,
          }),
          (error) => {
            if (error.type === 'MEMBERSHIP_NOT_FOUND') {
              return {
                status: 404 as const,
                body: { message: 'Member not found' },
              };
            }
            if (error.type === 'LAST_ADMIN') {
              return {
                status: 400 as const,
                body: { message: 'Cannot remove the last admin' },
              };
            }
            return {
              status: 500 as const,
              body: { message: 'Failed to remove member' },
            };
          }
        );
      },
    });

    s.registerRouter(organizationContract, router, orgApp, {
      jsonQuery: true,
      responseValidation: true,
      requestValidationErrorHandler: (err, _request, reply) => {
        return reply.status(400).send({ message: err.message });
      },
    });
  });
};

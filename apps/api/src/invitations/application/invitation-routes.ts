import type { FastifyInstance, FastifyRequest } from 'fastify';
import { initServer } from '@ts-rest/fastify';
import { invitationContract } from '@yoink/api-contracts';
import type { InvitationService } from '../../organizations/domain/invitation-service.js';
import type { MembershipService } from '../../organizations/domain/membership-service.js';
import type { AuthMiddleware } from '../../auth/application/auth-middleware.js';

export type InvitationRoutesDependencies = {
  invitationService: InvitationService;
  membershipService: MembershipService;
  authMiddleware: AuthMiddleware;
};

// Helper to check if a route needs authentication
const isPublicRoute = (request: FastifyRequest): boolean => {
  return request.url.includes('/invitations/validate');
};

export const registerInvitationRoutes = async (
  app: FastifyInstance,
  deps: InvitationRoutesDependencies
) => {
  const { invitationService, membershipService, authMiddleware } = deps;
  const s = initServer();

  // Register all invitation routes
  await app.register(async (invitationApp) => {
    // Apply auth middleware conditionally - skip for public routes
    invitationApp.addHook('preHandler', async (request, reply) => {
      if (isPublicRoute(request)) {
        return; // Skip auth for public routes
      }
      return authMiddleware(request, reply);
    });

    const router = s.router(invitationContract, {
      validate: async ({ body }) => {
        const result = await invitationService.validateInvitation({
          code: body.code,
          email: body.email,
        });

        if (result.isErr()) {
          const error = result.error;
          switch (error.type) {
            case 'INVITATION_NOT_FOUND':
              return {
                status: 404 as const,
                body: { message: 'Invitation not found' },
              };
            case 'INVITATION_EXPIRED':
              return {
                status: 410 as const,
                body: { message: 'Invitation has expired' },
              };
            case 'INVITATION_ALREADY_ACCEPTED':
              return {
                status: 410 as const,
                body: { message: 'Invitation has already been used' },
              };
            case 'INVITATION_EMAIL_MISMATCH':
              return {
                status: 400 as const,
                body: { message: 'Email does not match invitation' },
              };
            default:
              return {
                status: 500 as const,
                body: { message: 'Internal server error' },
              };
          }
        }

        const invitation = result.value;

        return {
          status: 200 as const,
          body: invitation,
        };
      },

      create: async ({ body, request }) => {
        const result = await invitationService.createInvitation({
          organizationId: body.organizationId,
          invitedByUserId: request.authContext.userId,
          role: body.role,
          email: body.email,
          expiresInDays: body.expiresInDays,
        });

        return result.match(
          (invitation) => ({
            status: 201 as const,
            body: invitation,
          }),
          (error) => {
            switch (error.type) {
              case 'INVITATION_ORG_NOT_FOUND':
                return {
                  status: 404 as const,
                  body: { message: 'Organization not found' },
                };
              case 'INSUFFICIENT_INVITE_PERMISSIONS':
                return {
                  status: 403 as const,
                  body: { message: 'Insufficient permissions to create invitation' },
                };
              default:
                return {
                  status: 500 as const,
                  body: { message: 'Internal server error' },
                };
            }
          }
        );
      },

      accept: async ({ body, request }) => {
        // First validate the invitation
        const validateResult = await invitationService.validateInvitation({
          code: body.code,
        });

        if (validateResult.isErr()) {
          const error = validateResult.error;
          switch (error.type) {
            case 'INVITATION_NOT_FOUND':
              return {
                status: 404 as const,
                body: { message: 'Invitation not found' },
              };
            case 'INVITATION_EXPIRED':
              return {
                status: 410 as const,
                body: { message: 'Invitation has expired' },
              };
            case 'INVITATION_ALREADY_ACCEPTED':
              return {
                status: 410 as const,
                body: { message: 'Invitation has already been used' },
              };
            default:
              return {
                status: 500 as const,
                body: { message: 'Internal server error' },
              };
          }
        }

        const invitation = validateResult.value;

        // Check if user is already a member
        const membershipResult = await membershipService.getMembership({
          userId: request.authContext.userId,
          organizationId: invitation.organizationId,
        });

        if (membershipResult.isErr()) {
          return {
            status: 500 as const,
            body: { message: 'Internal server error' },
          };
        }

        if (membershipResult.value !== null) {
          return {
            status: 409 as const,
            body: { message: 'Already a member of this organization' },
          };
        }

        // Accept the invitation
        const acceptResult = await invitationService.acceptInvitation({
          code: body.code,
          userId: request.authContext.userId,
        });

        if (acceptResult.isErr()) {
          return {
            status: 500 as const,
            body: { message: 'Internal server error' },
          };
        }

        // Create membership
        const addMemberResult = await membershipService.addMember({
          userId: request.authContext.userId,
          organizationId: invitation.organizationId,
          role: invitation.role,
        });

        if (addMemberResult.isErr()) {
          return {
            status: 500 as const,
            body: { message: 'Failed to create membership' },
          };
        }

        return {
          status: 200 as const,
          body: acceptResult.value,
        };
      },

      listPending: async ({ params, request }) => {
        // Check permissions - user must be admin/owner of the organization
        const hasPermission = await membershipService.hasRole({
          userId: request.authContext.userId,
          organizationId: params.organizationId,
          requiredRole: 'admin',
        });

        if (hasPermission.isErr()) {
          return {
            status: 500 as const,
            body: { message: 'Internal server error' },
          };
        }

        if (!hasPermission.value) {
          return {
            status: 403 as const,
            body: { message: 'Insufficient permissions' },
          };
        }

        const result = await invitationService.listPendingInvitations({
          organizationId: params.organizationId,
        });

        return result.match(
          (invitations) => ({
            status: 200 as const,
            body: { invitations },
          }),
          () => ({
            status: 500 as const,
            body: { message: 'Internal server error' },
          })
        );
      },

      revoke: async ({ params, request }) => {
        const result = await invitationService.revokeInvitation({
          invitationId: params.invitationId,
          revokedByUserId: request.authContext.userId,
        });

        return result.match(
          () => ({
            status: 204 as const,
            body: undefined,
          }),
          (error) => {
            switch (error.type) {
              case 'INVITATION_NOT_FOUND':
                return {
                  status: 404 as const,
                  body: { message: 'Invitation not found' },
                };
              case 'INSUFFICIENT_INVITE_PERMISSIONS':
                return {
                  status: 403 as const,
                  body: { message: 'Insufficient permissions to revoke invitation' },
                };
              default:
                return {
                  status: 500 as const,
                  body: { message: 'Internal server error' },
                };
            }
          }
        );
      },
    });

    s.registerRouter(invitationContract, router, invitationApp, {
      jsonQuery: true,
      responseValidation: true,
      requestValidationErrorHandler: (err, _request, reply) => {
        return reply.status(400).send({ message: err.message });
      },
    });
  });
};

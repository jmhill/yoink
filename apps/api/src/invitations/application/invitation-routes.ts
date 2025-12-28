import type { FastifyInstance } from 'fastify';
import { initServer } from '@ts-rest/fastify';
import { invitationContract } from '@yoink/api-contracts';
import type { InvitationService } from '../../organizations/domain/invitation-service.js';
import type { MembershipService } from '../../organizations/domain/membership-service.js';
import type { OrganizationStore } from '../../organizations/domain/organization-store.js';
import type { AuthMiddleware } from '../../auth/application/auth-middleware.js';

export type InvitationRoutesDependencies = {
  invitationService: InvitationService;
  membershipService: MembershipService;
  organizationStore: OrganizationStore;
  authMiddleware: AuthMiddleware;
};

export const registerInvitationRoutes = async (
  app: FastifyInstance,
  deps: InvitationRoutesDependencies
) => {
  const { invitationService, membershipService, organizationStore, authMiddleware } = deps;
  const s = initServer();

  // Public routes (no auth required)
  await app.register(async (publicApp) => {
    // Validate endpoint - public, no auth needed
    publicApp.post('/api/invitations/validate', async (request, reply) => {
      const body = request.body as { code: string; email?: string };
      
      const result = await invitationService.validateInvitation({
        code: body.code,
        email: body.email,
      });

      if (result.isErr()) {
        const error = result.error;
        switch (error.type) {
          case 'INVITATION_NOT_FOUND':
            return reply.status(404).send({ message: 'Invitation not found' });
          case 'INVITATION_EXPIRED':
            return reply.status(410).send({ message: 'Invitation has expired' });
          case 'INVITATION_ALREADY_ACCEPTED':
            return reply.status(410).send({ message: 'Invitation has already been used' });
          case 'INVITATION_EMAIL_MISMATCH':
            return reply.status(400).send({ message: 'Email does not match invitation' });
          default:
            return reply.status(500).send({ message: 'Internal server error' });
        }
      }

      const invitation = result.value;
      
      // Include organization name for display
      const orgResult = await organizationStore.findById(invitation.organizationId);
      const orgName = orgResult.isOk() && orgResult.value 
        ? orgResult.value.name 
        : undefined;
      
      return reply.status(200).send({ ...invitation, organizationName: orgName });
    });
  });

  // Authenticated routes
  await app.register(async (authedApp) => {
    authedApp.addHook('preHandler', authMiddleware);

    const router = s.router(invitationContract, {
      validate: async () => {
        // This is handled by the public route above
        // Return 404 to prevent double-handling
        return {
          status: 404 as const,
          body: { message: 'Use the public validate endpoint' },
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
    });

    s.registerRouter(invitationContract, router, authedApp, {
      jsonQuery: true,
      responseValidation: true,
      requestValidationErrorHandler: (err, _request, reply) => {
        return reply.status(400).send({ message: err.message });
      },
    });
  });
};

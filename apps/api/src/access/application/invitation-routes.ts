import type { FastifyInstance, FastifyRequest } from 'fastify';
import { initServer } from '@ts-rest/fastify';
import { invitationContract } from '@yoink/api-contracts';
import type { InvitationService } from '../domain/invitation-service.js';
import type { MembershipService } from '../domain/membership-service.js';
import type { OrganizationService } from '../domain/organization-service.js';
import type { UserService } from '../domain/user-service.js';
import type { AuthMiddleware } from './auth-middleware.js';
import { namedRequestValidationError } from '../../shared/request-validation.js';
import { handleAcceptInvitation } from './handle-accept-invitation.js';
import {
  acceptInvitationErrorResponse,
  createInvitationErrorResponse,
  listPendingInvitationErrorResponse,
  logAndReturnStorageFailure,
  revokeInvitationErrorResponse,
  validateInvitationErrorResponse,
} from './access-http-errors.js';

export type InvitationRoutesDependencies = {
  invitationService: InvitationService;
  membershipService: MembershipService;
  organizationService: OrganizationService;
  userService: UserService;
  acceptInvitation: (
    command: Parameters<typeof handleAcceptInvitation>[0]
  ) => ReturnType<typeof handleAcceptInvitation>;
  authMiddleware: AuthMiddleware;
};

const isPublicRoute = (request: FastifyRequest): boolean => {
  return request.url.includes('/invitations/validate');
};

export const registerInvitationRoutes = async (
  app: FastifyInstance,
  deps: InvitationRoutesDependencies
) => {
  const {
    invitationService,
    membershipService,
    organizationService,
    userService,
    acceptInvitation,
    authMiddleware,
  } = deps;
  const s = initServer();

  await app.register(async (invitationApp) => {
    invitationApp.addHook('preHandler', async (request, reply) => {
      if (isPublicRoute(request)) {
        return;
      }
      return authMiddleware(request, reply);
    });

    const router = s.router(invitationContract, {
      validate: async ({ body, request }) => {
        const result = await invitationService.validateInvitation({
          code: body.code,
          email: body.email,
        });

        if (result.isErr()) {
          return validateInvitationErrorResponse(request, result.error);
        }

        const invitation = result.value;
        const orgResult = await organizationService.getOrganization(invitation.organizationId);
        if (orgResult.isErr()) {
          return logAndReturnStorageFailure(
            request,
            orgResult.error,
            'Internal server error'
          );
        }
        const organizationName = orgResult.value ? orgResult.value.name : undefined;

        return {
          status: 200 as const,
          body: {
            ...invitation,
            organizationName,
          },
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
          (error) => createInvitationErrorResponse(request, error)
        );
      },

      accept: async ({ body, request }) => {
        const userResult = await userService.getUser(request.authContext.userId);
        if (userResult.isErr()) {
          return logAndReturnStorageFailure(request, userResult.error, 'Internal server error');
        }
        if (userResult.value === null) {
          return logAndReturnStorageFailure(
            request,
            { type: 'USER_NOT_FOUND', userId: request.authContext.userId },
            'Internal server error'
          );
        }

        const result = await acceptInvitation({
          code: body.code,
          account: {
            userId: request.authContext.userId,
            email: userResult.value.email,
          },
        });

        return result.match(
          (invitation) => ({
            status: 200 as const,
            body: invitation,
          }),
          (error) => acceptInvitationErrorResponse(request, error)
        );
      },

      listPending: async ({ params, request }) => {
        const hasPermission = await membershipService.hasRole({
          userId: request.authContext.userId,
          organizationId: params.organizationId,
          requiredRole: 'admin',
        });

        if (hasPermission.isErr()) {
          return logAndReturnStorageFailure(
            request,
            hasPermission.error,
            'Internal server error'
          );
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
          (error) => listPendingInvitationErrorResponse(request, error)
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
          (error) => revokeInvitationErrorResponse(request, error)
        );
      },
    });

    s.registerRouter(invitationContract, router, invitationApp, {
      jsonQuery: true,
      responseValidation: true,
      requestValidationErrorHandler: (err, _request, reply) => {
        return reply.status(400).send(namedRequestValidationError(err));
      },
    });
  });
};

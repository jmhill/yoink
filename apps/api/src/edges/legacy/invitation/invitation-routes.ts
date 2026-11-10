import type { FastifyInstance, FastifyRequest } from 'fastify';
import { OpenAPIHandler } from '@orpc/openapi/fastify';
import { implement } from '@orpc/server';
import { invitationOrpcContract } from '@yoink/api-contracts/orpc';
import type { InvitationService } from '../../../access/domain/index.js';
import type { MembershipService } from '../../../access/domain/membership-service.js';
import type { OrganizationService } from '../../../access/domain/organization-service.js';
import type { UserService } from '../../../access/domain/user-service.js';
import type { AuthMiddleware } from '../../_shared/auth/auth-middleware.js';
import { handleAcceptInvitation } from '../../../access/application/handle-accept-invitation.js';
import { handleValidateInvitation } from '../../../access/application/handle-validate-invitation.js';
import { dispatchOrpc } from '../../_shared/orpc/dispatch.js';
import { yoinkOpenApiHandlerOptions } from '../../_shared/orpc/handler-options.js';
import type { OrpcHttpContext } from '../../_shared/orpc/http-context.js';
import {
  acceptInvitationErrorResponse,
  accessHttpError,
  accessInternalError,
  createInvitationErrorResponse,
  listPendingInvitationErrorResponse,
  revokeInvitationErrorResponse,
  validateInvitationErrorResponse,
} from '../../_shared/auth/access-http-errors.js';

export type InvitationRoutesDependencies = {
  invitationService: InvitationService;
  membershipService: MembershipService;
  organizationService: OrganizationService;
  userService: UserService;
  validateInvitation: (
    query: Parameters<typeof handleValidateInvitation>[0]
  ) => ReturnType<typeof handleValidateInvitation>;
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
    validateInvitation,
    acceptInvitation,
    authMiddleware,
  } = deps;

  const invitations = implement(invitationOrpcContract).$context<OrpcHttpContext>();
  const invitationRouter = invitations.router({
    validate: invitations.validate.handler(async ({ input }) => {
      const result = await validateInvitation({
        code: input.code,
        email: input.email,
      });
      if (result.isErr()) {
        throw validateInvitationErrorResponse(result.error);
      }

      const invitation = result.value;
      const orgResult = await organizationService.getOrganization(invitation.organizationId);
      if (orgResult.isErr()) {
        throw accessInternalError(orgResult.error);
      }
      const organizationName = orgResult.value ? orgResult.value.name : undefined;

      return {
        ...invitation,
        organizationName,
      };
    }),
    create: invitations.create.handler(async ({ input, context }) => {
      const result = await invitationService.createInvitation({
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
    accept: invitations.accept.handler(async ({ input, context }) => {
      const userResult = await userService.getUser(context.request.authContext.userId);
      if (userResult.isErr()) {
        throw accessInternalError(userResult.error);
      }
      if (userResult.value === null) {
        throw accessInternalError({
          type: 'USER_NOT_FOUND',
          userId: context.request.authContext.userId,
        });
      }

      const result = await acceptInvitation({
        code: input.code,
        account: {
          userId: context.request.authContext.userId,
          email: userResult.value.email,
        },
      });
      return result.match(
        (invitation) => invitation,
        (error) => {
          throw acceptInvitationErrorResponse(error);
        }
      );
    }),
    listPending: invitations.listPending.handler(async ({ input, context }) => {
      const hasPermission = await membershipService.hasRole({
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

      const result = await invitationService.listPendingInvitations({
        organizationId: input.organizationId,
      });
      return result.match(
        (pending) => ({ invitations: pending }),
        (error) => {
          throw listPendingInvitationErrorResponse(error);
        }
      );
    }),
    revoke: invitations.revoke.handler(async ({ input, context }) => {
      const result = await invitationService.revokeInvitation({
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
  });

  const handler = new OpenAPIHandler(invitationRouter, yoinkOpenApiHandlerOptions);

  await app.register(async (invitationApp) => {
    invitationApp.addHook('preHandler', async (request, reply) => {
      if (isPublicRoute(request)) {
        return;
      }
      return authMiddleware(request, reply);
    });

    const mount = (
      method: 'GET' | 'POST' | 'DELETE',
      url: string
    ) => {
      invitationApp.route({
        method,
        url,
        handler: async (request, reply) => dispatchOrpc(handler, request, reply),
      });
    };

    mount('POST', '/api/invitations');
    mount('POST', '/api/invitations/validate');
    mount('POST', '/api/invitations/accept');
    mount('GET', '/api/organizations/:organizationId/invitations');
    mount('DELETE', '/api/invitations/:invitationId');
  });
};

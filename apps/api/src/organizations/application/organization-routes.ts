import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { initServer } from '@ts-rest/fastify';
import { organizationContract } from '@yoink/api-contracts';
import type { SessionService } from '../../auth/domain/session-service.js';
import type { MembershipService } from '../domain/membership-service.js';

export type OrganizationRoutesDependencies = {
  sessionService: SessionService;
  membershipService: MembershipService;
  sessionCookieName: string;
};

/**
 * Middleware to validate session and attach it to the request.
 * Only supports session cookies (not API tokens) since switching org
 * is a session-based operation.
 */
const createSessionMiddleware = (
  sessionService: SessionService,
  sessionCookieName: string
) => {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const sessionId = request.cookies[sessionCookieName];

    if (!sessionId) {
      return reply.status(401).send({ message: 'Authentication required' });
    }

    const sessionResult = await sessionService.validateSession(sessionId);

    if (sessionResult.isErr()) {
      return reply.status(500).send({ message: 'Failed to validate session' });
    }

    const session = sessionResult.value;
    if (!session) {
      return reply.status(401).send({ message: 'Invalid or expired session' });
    }

    // Attach session to request for route handlers
    request.userSession = session;
  };
};

export const registerOrganizationRoutes = async (
  app: FastifyInstance,
  deps: OrganizationRoutesDependencies
) => {
  const { sessionService, membershipService, sessionCookieName } = deps;
  const s = initServer();

  const sessionMiddleware = createSessionMiddleware(sessionService, sessionCookieName);

  await app.register(async (orgApp) => {
    // Apply session middleware to all routes
    orgApp.addHook('preHandler', sessionMiddleware);

    const router = s.router(organizationContract, {
      switch: async ({ body, request }) => {
        const { organizationId } = body;
        const session = request.userSession;

        if (!session) {
          return {
            status: 401 as const,
            body: { message: 'Authentication required' },
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

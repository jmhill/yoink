import type { FastifyRequest, FastifyReply } from 'fastify';
import type { AdminSession, AdminSessionService } from '../domain/admin-session-service.js';

declare module 'fastify' {
  interface FastifyRequest {
    adminSession?: AdminSession;
  }
}

export const ADMIN_SESSION_COOKIE = 'admin_session';

export type AdminSessionMiddlewareDependencies = {
  adminSessionService: AdminSessionService;
};

export const createAdminSessionMiddleware = (
  deps: AdminSessionMiddlewareDependencies
) => {
  const { adminSessionService } = deps;

  return async (
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> => {
    const sessionToken = (request.cookies as Record<string, string>)?.[
      ADMIN_SESSION_COOKIE
    ];

    if (!sessionToken) {
      return reply.status(401).send({ message: 'Not authenticated' });
    }

    const session = adminSessionService.verifySession(sessionToken);

    if (!session) {
      return reply.status(401).send({ message: 'Invalid or expired session' });
    }

    request.adminSession = session;
  };
};

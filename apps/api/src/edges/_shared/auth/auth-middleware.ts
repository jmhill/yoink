import type { FastifyRequest, FastifyReply } from 'fastify';
import type { AuthenticateToken } from '../../../access/index.js';
import type { AuthContext } from '../../../kernel/auth-context.js';

declare module 'fastify' {
  interface FastifyRequest {
    authContext: AuthContext;
  }
}

export type AuthMiddleware = (
  request: FastifyRequest,
  reply: FastifyReply
) => Promise<void>;

export type AuthMiddlewareDependencies = {
  authenticateToken: AuthenticateToken;
};

export const createAuthMiddleware = (deps: AuthMiddlewareDependencies) => {
  const { authenticateToken } = deps;

  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const authHeader = request.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
      return reply.status(401).send({ message: 'Missing authorization header' });
    }

    const token = authHeader.slice(7);
    const result = await authenticateToken(token);

    if (result.isErr()) {
      // For security, we don't reveal specific error details to the client
      return reply.status(401).send({ message: 'Invalid token' });
    }

    request.authContext = {
      organizationId: result.value.organizationId,
      userId: result.value.userId,
      principalKind: result.value.principalKind,
      actor: result.value.actor,
    };

    // Bind auth context to request logger for all subsequent logs
    request.log = request.log.child({
      userId: request.authContext.userId,
      orgId: request.authContext.organizationId,
    });
  };
};

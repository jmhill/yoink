import type { FastifyRequest, FastifyReply } from 'fastify';
import type { AuthContext } from '../../shared/auth-context.js';
import type { TokenService } from '../domain/token-service.js';

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
  tokenService: TokenService;
};

export const createAuthMiddleware = (deps: AuthMiddlewareDependencies) => {
  const { tokenService } = deps;

  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const authHeader = request.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
      return reply.status(401).send({ message: 'Missing authorization header' });
    }

    const token = authHeader.slice(7);

    const result = await tokenService.validateToken({ plaintext: token });

    if (result.isErr()) {
      // For security, we don't reveal specific error details to the client
      return reply.status(401).send({ message: 'Invalid token' });
    }

    request.authContext = {
      organizationId: result.value.organization.id,
      userId: result.value.user.id,
    };
  };
};

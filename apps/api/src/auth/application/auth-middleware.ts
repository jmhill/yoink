import type { FastifyRequest, FastifyReply } from 'fastify';
import type { AuthContext } from '../../shared/auth-context.js';

declare module 'fastify' {
  interface FastifyRequest {
    authContext: AuthContext;
  }
}

const VALID_TOKEN = 'test-token-xyz';

export const HARDCODED_AUTH_CONTEXT: AuthContext = {
  organizationId: '550e8400-e29b-41d4-a716-446655440001',
  userId: '550e8400-e29b-41d4-a716-446655440002',
};

export const authMiddleware = async (
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> => {
  const authHeader = request.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    return reply.status(401).send({ message: 'Missing authorization header' });
  }

  const token = authHeader.slice(7);

  if (token !== VALID_TOKEN) {
    return reply.status(401).send({ message: 'Invalid token' });
  }

  request.authContext = HARDCODED_AUTH_CONTEXT;
};

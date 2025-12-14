import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { initServer } from '@ts-rest/fastify';
import { adminContract } from '@yoink/api-contracts';
import type { AdminService } from '../domain/admin-service.js';
import type { AdminSessionService } from '../domain/admin-session-service.js';
import { ADMIN_SESSION_COOKIE } from './admin-session-middleware.js';

export type AdminRoutesDependencies = {
  adminService: AdminService;
  adminSessionService: AdminSessionService;
};

/**
 * Helper to check admin session authentication.
 * Returns the session if valid, or a 401 response object if not.
 */
const requireAdminAuth = (
  request: FastifyRequest,
  adminSessionService: AdminSessionService
) => {
  const sessionToken = (request.cookies as Record<string, string>)?.[ADMIN_SESSION_COOKIE];

  if (!sessionToken) {
    return { status: 401 as const, body: { message: 'Not authenticated' } };
  }

  const session = adminSessionService.verifySession(sessionToken);
  if (!session) {
    return { status: 401 as const, body: { message: 'Invalid or expired session' } };
  }

  return session;
};

/**
 * Helper to convert storage errors to 500 responses
 */
const storageErrorResponse = (message: string) => ({
  status: 500 as const,
  body: { message },
});

export const registerAdminRoutes = async (
  app: FastifyInstance,
  deps: AdminRoutesDependencies
) => {
  const { adminService, adminSessionService } = deps;
  const s = initServer();

  const router = s.router(adminContract, {
    // Public routes - session management
    login: async ({ body, reply }: { body: { password: string }; reply: FastifyReply }) => {
      const result = adminSessionService.login(body.password);

      if (!result.success) {
        return {
          status: 401 as const,
          body: { message: 'Invalid password' },
        };
      }

      reply.setCookie(ADMIN_SESSION_COOKIE, result.sessionToken!, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        path: '/',
        maxAge: 24 * 60 * 60, // 24 hours
      });

      return {
        status: 200 as const,
        body: { success: true },
      };
    },

    logout: async ({ reply }: { reply: FastifyReply }) => {
      reply.clearCookie(ADMIN_SESSION_COOKIE, {
        path: '/',
      });

      return {
        status: 200 as const,
        body: { success: true },
      };
    },

    // Protected routes - Organizations
    listOrganizations: async ({ request }: { request: FastifyRequest }) => {
      const auth = requireAdminAuth(request, adminSessionService);
      if ('status' in auth) return auth;

      const result = await adminService.listOrganizations();
      return result.match(
        (organizations) => ({
          status: 200 as const,
          body: { organizations },
        }),
        () => storageErrorResponse('Failed to list organizations')
      );
    },

    createOrganization: async ({ body, request }: { body: { name: string }; request: FastifyRequest }) => {
      const auth = requireAdminAuth(request, adminSessionService);
      if ('status' in auth) return auth;

      const result = await adminService.createOrganization(body.name);
      return result.match(
        (organization) => ({
          status: 201 as const,
          body: organization,
        }),
        () => storageErrorResponse('Failed to create organization')
      );
    },

    getOrganization: async ({ params, request }: { params: { id: string }; request: FastifyRequest }) => {
      const auth = requireAdminAuth(request, adminSessionService);
      if ('status' in auth) return auth;

      const result = await adminService.getOrganization(params.id);
      return result.match(
        (organization) => {
          if (!organization) {
            return {
              status: 404 as const,
              body: { message: 'Organization not found' },
            };
          }
          return {
            status: 200 as const,
            body: organization,
          };
        },
        () => storageErrorResponse('Failed to get organization')
      );
    },

    // Protected routes - Users
    listUsers: async ({ params, request }: { params: { organizationId: string }; request: FastifyRequest }) => {
      const auth = requireAdminAuth(request, adminSessionService);
      if ('status' in auth) return auth;

      // Check if organization exists
      const orgResult = await adminService.getOrganization(params.organizationId);
      const orgCheck = orgResult.match(
        (org) => (org ? null : { status: 404 as const, body: { message: 'Organization not found' } }),
        () => storageErrorResponse('Failed to check organization')
      );
      if (orgCheck) return orgCheck;

      const result = await adminService.listUsers(params.organizationId);
      return result.match(
        (users) => ({
          status: 200 as const,
          body: { users },
        }),
        () => storageErrorResponse('Failed to list users')
      );
    },

    createUser: async ({ params, body, request }: { params: { organizationId: string }; body: { email: string }; request: FastifyRequest }) => {
      const auth = requireAdminAuth(request, adminSessionService);
      if ('status' in auth) return auth;

      // Check if organization exists
      const orgResult = await adminService.getOrganization(params.organizationId);
      const orgCheck = orgResult.match(
        (org) => (org ? null : { status: 404 as const, body: { message: 'Organization not found' } }),
        () => storageErrorResponse('Failed to check organization')
      );
      if (orgCheck) return orgCheck;

      const result = await adminService.createUser(params.organizationId, body.email);
      return result.match(
        (user) => ({
          status: 201 as const,
          body: user,
        }),
        () => storageErrorResponse('Failed to create user')
      );
    },

    getUser: async ({ params, request }: { params: { id: string }; request: FastifyRequest }) => {
      const auth = requireAdminAuth(request, adminSessionService);
      if ('status' in auth) return auth;

      const result = await adminService.getUser(params.id);
      return result.match(
        (user) => {
          if (!user) {
            return {
              status: 404 as const,
              body: { message: 'User not found' },
            };
          }
          return {
            status: 200 as const,
            body: user,
          };
        },
        () => storageErrorResponse('Failed to get user')
      );
    },

    // Protected routes - Tokens
    listTokens: async ({ params, request }: { params: { userId: string }; request: FastifyRequest }) => {
      const auth = requireAdminAuth(request, adminSessionService);
      if ('status' in auth) return auth;

      // Check if user exists
      const userResult = await adminService.getUser(params.userId);
      const userCheck = userResult.match(
        (user) => (user ? null : { status: 404 as const, body: { message: 'User not found' } }),
        () => storageErrorResponse('Failed to check user')
      );
      if (userCheck) return userCheck;

      const result = await adminService.listTokens(params.userId);
      return result.match(
        (tokens) => ({
          status: 200 as const,
          body: { tokens },
        }),
        () => storageErrorResponse('Failed to list tokens')
      );
    },

    createToken: async ({ params, body, request }: { params: { userId: string }; body: { name: string }; request: FastifyRequest }) => {
      const auth = requireAdminAuth(request, adminSessionService);
      if ('status' in auth) return auth;

      // Check if user exists
      const userResult = await adminService.getUser(params.userId);
      const userCheck = userResult.match(
        (user) => (user ? null : { status: 404 as const, body: { message: 'User not found' } }),
        () => storageErrorResponse('Failed to check user')
      );
      if (userCheck) return userCheck;

      const result = await adminService.createToken(params.userId, body.name);
      return result.match(
        (tokenResult) => ({
          status: 201 as const,
          body: {
            token: tokenResult.token,
            rawToken: tokenResult.rawToken,
          },
        }),
        () => storageErrorResponse('Failed to create token')
      );
    },

    revokeToken: async ({ params, request }: { params: { id: string }; request: FastifyRequest }) => {
      const auth = requireAdminAuth(request, adminSessionService);
      if ('status' in auth) return auth;

      // We don't check if token exists - just delete it (idempotent)
      const result = await adminService.revokeToken(params.id);
      return result.match(
        () => ({
          status: 204 as const,
          body: undefined,
        }),
        () => storageErrorResponse('Failed to revoke token')
      );
    },
  });

  s.registerRouter(adminContract, router, app, {
    responseValidation: true,
    requestValidationErrorHandler: (err, _request, reply) => {
      return reply.status(400).send({ message: err.message });
    },
  });
};

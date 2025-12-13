import type { FastifyInstance, FastifyRequest } from 'fastify';
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

export const registerAdminRoutes = async (
  app: FastifyInstance,
  deps: AdminRoutesDependencies
) => {
  const { adminService, adminSessionService } = deps;
  const s = initServer();

  const router = s.router(adminContract, {
    // Public routes - session management
    login: async ({ body, reply }) => {
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

    logout: async ({ reply }) => {
      reply.clearCookie(ADMIN_SESSION_COOKIE, {
        path: '/',
      });

      return {
        status: 200 as const,
        body: { success: true },
      };
    },

    // Protected routes - Organizations
    listOrganizations: async ({ request }) => {
      const auth = requireAdminAuth(request, adminSessionService);
      if ('status' in auth) return auth;

      const organizations = await adminService.listOrganizations();
      return {
        status: 200 as const,
        body: { organizations },
      };
    },

    createOrganization: async ({ body, request }) => {
      const auth = requireAdminAuth(request, adminSessionService);
      if ('status' in auth) return auth;

      const organization = await adminService.createOrganization(body.name);
      return {
        status: 201 as const,
        body: organization,
      };
    },

    getOrganization: async ({ params, request }) => {
      const auth = requireAdminAuth(request, adminSessionService);
      if ('status' in auth) return auth;

      const organization = await adminService.getOrganization(params.id);

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

    // Protected routes - Users
    listUsers: async ({ params, request }) => {
      const auth = requireAdminAuth(request, adminSessionService);
      if ('status' in auth) return auth;

      // Check if organization exists
      const organization = await adminService.getOrganization(params.organizationId);
      if (!organization) {
        return {
          status: 404 as const,
          body: { message: 'Organization not found' },
        };
      }

      const users = await adminService.listUsers(params.organizationId);
      return {
        status: 200 as const,
        body: { users },
      };
    },

    createUser: async ({ params, body, request }) => {
      const auth = requireAdminAuth(request, adminSessionService);
      if ('status' in auth) return auth;

      // Check if organization exists
      const organization = await adminService.getOrganization(params.organizationId);
      if (!organization) {
        return {
          status: 404 as const,
          body: { message: 'Organization not found' },
        };
      }

      const user = await adminService.createUser(params.organizationId, body.email);
      return {
        status: 201 as const,
        body: user,
      };
    },

    getUser: async ({ params, request }) => {
      const auth = requireAdminAuth(request, adminSessionService);
      if ('status' in auth) return auth;

      const user = await adminService.getUser(params.id);

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

    // Protected routes - Tokens
    listTokens: async ({ params, request }) => {
      const auth = requireAdminAuth(request, adminSessionService);
      if ('status' in auth) return auth;

      // Check if user exists
      const user = await adminService.getUser(params.userId);
      if (!user) {
        return {
          status: 404 as const,
          body: { message: 'User not found' },
        };
      }

      const tokens = await adminService.listTokens(params.userId);
      return {
        status: 200 as const,
        body: { tokens },
      };
    },

    createToken: async ({ params, body, request }) => {
      const auth = requireAdminAuth(request, adminSessionService);
      if ('status' in auth) return auth;

      // Check if user exists
      const user = await adminService.getUser(params.userId);
      if (!user) {
        return {
          status: 404 as const,
          body: { message: 'User not found' },
        };
      }

      const result = await adminService.createToken(params.userId, body.name);
      return {
        status: 201 as const,
        body: {
          token: result.token,
          rawToken: result.rawToken,
        },
      };
    },

    revokeToken: async ({ params, request }) => {
      const auth = requireAdminAuth(request, adminSessionService);
      if ('status' in auth) return auth;

      // We don't check if token exists - just delete it (idempotent)
      await adminService.revokeToken(params.id);
      return {
        status: 204 as const,
        body: undefined,
      };
    },
  });

  s.registerRouter(adminContract, router, app, {
    responseValidation: true,
    requestValidationErrorHandler: (err, _request, reply) => {
      return reply.status(400).send({ message: err.message });
    },
  });
};

import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import {
  OrganizationSchema,
  CreateOrganizationSchema,
  UpdateOrganizationSchema,
  UserSchema,
  CreateUserSchema,
  ApiTokenSchema,
  CreateTokenSchema,
  CreateTokenResponseSchema,
  AdminCreateInvitationSchema,
  AdminInvitationResponseSchema,
  LoginRequestSchema,
  LoginResponseSchema,
  SessionResponseSchema,
} from '../schemas/admin.js';
import { ErrorSchema } from '../schemas/error.js';

const c = initContract();

/**
 * Public admin routes - no authentication required
 */
export const adminPublicContract = c.router(
  {
    login: {
      method: 'POST',
      path: '/api/admin/login',
      body: LoginRequestSchema,
      responses: {
        200: LoginResponseSchema,
        401: ErrorSchema,
      },
      summary: 'Login to admin panel',
    },

    logout: {
      method: 'POST',
      path: '/api/admin/logout',
      body: z.object({}),
      responses: {
        200: LoginResponseSchema,
      },
      summary: 'Logout from admin panel',
    },
  },
  {
    strictStatusCodes: true,
  }
);

/**
 * Protected admin routes - require session authentication
 */
export const adminProtectedContract = c.router(
  {
    // Session
    getSession: {
      method: 'GET',
      path: '/api/admin/session',
      responses: {
        200: SessionResponseSchema,
        401: ErrorSchema,
      },
      summary: 'Check if session is valid',
    },

    // Organizations
    listOrganizations: {
      method: 'GET',
      path: '/api/admin/organizations',
      responses: {
        200: z.object({
          organizations: z.array(OrganizationSchema),
        }),
        401: ErrorSchema,
        500: ErrorSchema,
      },
      summary: 'List all organizations',
    },

    createOrganization: {
      method: 'POST',
      path: '/api/admin/organizations',
      body: CreateOrganizationSchema,
      responses: {
        201: OrganizationSchema,
        400: ErrorSchema,
        401: ErrorSchema,
        500: ErrorSchema,
      },
      summary: 'Create a new organization',
    },

    getOrganization: {
      method: 'GET',
      path: '/api/admin/organizations/:id',
      pathParams: z.object({
        id: z.string().uuid(),
      }),
      responses: {
        200: OrganizationSchema,
        401: ErrorSchema,
        404: ErrorSchema,
        500: ErrorSchema,
      },
      summary: 'Get an organization by ID',
    },

    updateOrganization: {
      method: 'PATCH',
      path: '/api/admin/organizations/:id',
      pathParams: z.object({
        id: z.string().uuid(),
      }),
      body: UpdateOrganizationSchema,
      responses: {
        200: OrganizationSchema,
        401: ErrorSchema,
        404: ErrorSchema,
        500: ErrorSchema,
      },
      summary: 'Update an organization',
    },

    // Users
    listUsers: {
      method: 'GET',
      path: '/api/admin/organizations/:organizationId/users',
      pathParams: z.object({
        organizationId: z.string().uuid(),
      }),
      responses: {
        200: z.object({
          users: z.array(UserSchema),
        }),
        401: ErrorSchema,
        404: ErrorSchema,
        500: ErrorSchema,
      },
      summary: 'List users in an organization',
    },

    createUser: {
      method: 'POST',
      path: '/api/admin/organizations/:organizationId/users',
      pathParams: z.object({
        organizationId: z.string().uuid(),
      }),
      body: CreateUserSchema,
      responses: {
        201: UserSchema,
        400: ErrorSchema,
        401: ErrorSchema,
        404: ErrorSchema,
        500: ErrorSchema,
      },
      summary: 'Create a system user in an organization (for API integrations)',
    },

    getUser: {
      method: 'GET',
      path: '/api/admin/users/:id',
      pathParams: z.object({
        id: z.string().uuid(),
      }),
      responses: {
        200: UserSchema,
        401: ErrorSchema,
        404: ErrorSchema,
        500: ErrorSchema,
      },
      summary: 'Get a user by ID',
    },

    // Tokens (scoped to organizations)
    listTokens: {
      method: 'GET',
      path: '/api/admin/organizations/:organizationId/tokens',
      pathParams: z.object({
        organizationId: z.string().uuid(),
      }),
      responses: {
        200: z.object({
          tokens: z.array(ApiTokenSchema),
        }),
        401: ErrorSchema,
        404: ErrorSchema,
        500: ErrorSchema,
      },
      summary: 'List tokens for an organization',
    },

    createToken: {
      method: 'POST',
      path: '/api/admin/organizations/:organizationId/tokens',
      pathParams: z.object({
        organizationId: z.string().uuid(),
      }),
      body: CreateTokenSchema,
      responses: {
        201: CreateTokenResponseSchema,
        400: ErrorSchema,
        401: ErrorSchema,
        404: ErrorSchema,
        500: ErrorSchema,
      },
      summary: 'Create a new API token for a user in an organization',
    },

    revokeToken: {
      method: 'DELETE',
      path: '/api/admin/tokens/:id',
      pathParams: z.object({
        id: z.string().uuid(),
      }),
      responses: {
        204: z.undefined(),
        401: ErrorSchema,
        500: ErrorSchema,
      },
      summary: 'Revoke (delete) an API token (idempotent)',
    },

    // Invitations
    createInvitation: {
      method: 'POST',
      path: '/api/admin/organizations/:organizationId/invitations',
      pathParams: z.object({
        organizationId: z.string().uuid(),
      }),
      body: AdminCreateInvitationSchema,
      responses: {
        201: AdminInvitationResponseSchema,
        400: ErrorSchema,
        401: ErrorSchema,
        404: ErrorSchema,
        500: ErrorSchema,
      },
      summary: 'Create an invitation to join an organization',
    },
  },
  {
    strictStatusCodes: true,
  }
);

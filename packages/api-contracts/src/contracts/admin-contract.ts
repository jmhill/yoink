import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import {
  OrganizationSchema,
  CreateOrganizationSchema,
  UserSchema,
  CreateUserSchema,
  ApiTokenSchema,
  CreateTokenSchema,
  CreateTokenResponseSchema,
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
      path: '/admin/login',
      body: LoginRequestSchema,
      responses: {
        200: LoginResponseSchema,
        401: ErrorSchema,
      },
      summary: 'Login to admin panel',
    },

    logout: {
      method: 'POST',
      path: '/admin/logout',
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
      path: '/admin/session',
      responses: {
        200: SessionResponseSchema,
        401: ErrorSchema,
      },
      summary: 'Check if session is valid',
    },

    // Organizations
    listOrganizations: {
      method: 'GET',
      path: '/admin/organizations',
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
      path: '/admin/organizations',
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
      path: '/admin/organizations/:id',
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

    // Users
    listUsers: {
      method: 'GET',
      path: '/admin/organizations/:organizationId/users',
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
      path: '/admin/organizations/:organizationId/users',
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
      summary: 'Create a new user in an organization',
    },

    getUser: {
      method: 'GET',
      path: '/admin/users/:id',
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

    // Tokens
    listTokens: {
      method: 'GET',
      path: '/admin/users/:userId/tokens',
      pathParams: z.object({
        userId: z.string().uuid(),
      }),
      responses: {
        200: z.object({
          tokens: z.array(ApiTokenSchema),
        }),
        401: ErrorSchema,
        404: ErrorSchema,
        500: ErrorSchema,
      },
      summary: 'List tokens for a user',
    },

    createToken: {
      method: 'POST',
      path: '/admin/users/:userId/tokens',
      pathParams: z.object({
        userId: z.string().uuid(),
      }),
      body: CreateTokenSchema,
      responses: {
        201: CreateTokenResponseSchema,
        400: ErrorSchema,
        401: ErrorSchema,
        404: ErrorSchema,
        500: ErrorSchema,
      },
      summary: 'Create a new API token for a user',
    },

    revokeToken: {
      method: 'DELETE',
      path: '/admin/tokens/:id',
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
  },
  {
    strictStatusCodes: true,
  }
);

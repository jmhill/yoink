import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import {
  SwitchOrganizationRequestSchema,
  SwitchOrganizationResponseSchema,
  LeaveOrganizationResponseSchema,
} from '../schemas/organization.js';
import { ErrorSchema } from '../schemas/error.js';

const c = initContract();

export const organizationContract = c.router({
  /**
   * Switch the current organization for the session.
   * Updates which organization's data the user sees.
   * Requires auth (token or session).
   */
  switch: {
    method: 'POST',
    path: '/api/organizations/switch',
    body: SwitchOrganizationRequestSchema,
    responses: {
      200: SwitchOrganizationResponseSchema,
      400: ErrorSchema, // Not a member of the organization
      401: ErrorSchema, // Not authenticated
      500: ErrorSchema,
    },
    summary: 'Switch current organization',
  },

  /**
   * Leave an organization.
   * Cannot leave personal org or as last admin.
   * Requires auth (token or session).
   */
  leave: {
    method: 'POST',
    path: '/api/organizations/:organizationId/leave',
    pathParams: z.object({
      organizationId: z.string().uuid(),
    }),
    body: z.undefined(),
    responses: {
      200: LeaveOrganizationResponseSchema,
      400: ErrorSchema, // Cannot leave personal org or last admin
      401: ErrorSchema, // Not authenticated
      404: ErrorSchema, // Not a member
      500: ErrorSchema,
    },
    summary: 'Leave an organization',
  },
}, {
  strictStatusCodes: true,
});

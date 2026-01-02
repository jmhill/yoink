import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import {
  SwitchOrganizationRequestSchema,
  SwitchOrganizationResponseSchema,
  LeaveOrganizationResponseSchema,
  ListMembersResponseSchema,
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

  /**
   * List members of an organization.
   * All members can view the member list.
   * Requires auth (token or session).
   */
  listMembers: {
    method: 'GET',
    path: '/api/organizations/:organizationId/members',
    pathParams: z.object({
      organizationId: z.string().uuid(),
    }),
    responses: {
      200: ListMembersResponseSchema,
      401: ErrorSchema, // Not authenticated
      403: ErrorSchema, // Not a member of the organization
      404: ErrorSchema, // Organization not found
      500: ErrorSchema,
    },
    summary: 'List organization members',
  },

  /**
   * Remove a member from an organization.
   * - Admins can remove members (but not other admins)
   * - Owners can remove admins and members
   * - Cannot remove self (use leave instead)
   * - Cannot remove the last owner
   * Requires auth (token or session).
   */
  removeMember: {
    method: 'DELETE',
    path: '/api/organizations/:organizationId/members/:userId',
    pathParams: z.object({
      organizationId: z.string().uuid(),
      userId: z.string().uuid(),
    }),
    body: z.undefined(),
    responses: {
      204: z.undefined(), // Success, no content
      400: ErrorSchema, // Cannot remove self, last admin, etc.
      401: ErrorSchema, // Not authenticated
      403: ErrorSchema, // Insufficient permissions
      404: ErrorSchema, // Member not found
      500: ErrorSchema,
    },
    summary: 'Remove a member from an organization',
  },
}, {
  strictStatusCodes: true,
});

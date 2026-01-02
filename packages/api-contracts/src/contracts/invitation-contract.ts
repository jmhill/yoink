import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import {
  InvitationSchema,
  CreateInvitationSchema,
  ValidateInvitationSchema,
  AcceptInvitationSchema,
} from '../schemas/invitation.js';
import { ErrorSchema } from '../schemas/error.js';

const c = initContract();

export const invitationContract = c.router({
  /**
   * Create a new invitation.
   * Requires admin/owner permissions in the organization.
   */
  create: {
    method: 'POST',
    path: '/api/invitations',
    body: CreateInvitationSchema,
    responses: {
      201: InvitationSchema,
      400: ErrorSchema,
      401: ErrorSchema,
      403: ErrorSchema, // Insufficient permissions
      404: ErrorSchema, // Organization not found
      500: ErrorSchema,
    },
    summary: 'Create a new invitation to join an organization',
  },

  /**
   * Validate an invitation code (without accepting it).
   * Public endpoint - no auth required.
   * Returns the invitation details so the user can see what they're accepting.
   */
  validate: {
    method: 'POST',
    path: '/api/invitations/validate',
    body: ValidateInvitationSchema,
    responses: {
      200: InvitationSchema,
      400: ErrorSchema, // Invalid code format
      404: ErrorSchema, // Not found
      410: ErrorSchema, // Expired or already accepted
      500: ErrorSchema,
    },
    summary: 'Validate an invitation code before accepting',
  },

  /**
   * Accept an invitation (for existing authenticated users).
   * Creates membership and marks invitation as accepted.
   */
  accept: {
    method: 'POST',
    path: '/api/invitations/accept',
    body: AcceptInvitationSchema,
    responses: {
      200: InvitationSchema,
      400: ErrorSchema,
      401: ErrorSchema,
      404: ErrorSchema, // Not found
      409: ErrorSchema, // Already a member
      410: ErrorSchema, // Expired or already accepted
      500: ErrorSchema,
    },
    summary: 'Accept an invitation and join the organization',
  },

  /**
   * List pending invitations for an organization.
   * Requires admin/owner permissions.
   */
  listPending: {
    method: 'GET',
    path: '/api/organizations/:organizationId/invitations',
    pathParams: z.object({
      organizationId: z.string().uuid(),
    }),
    responses: {
      200: z.object({
        invitations: z.array(InvitationSchema),
      }),
      401: ErrorSchema,
      403: ErrorSchema, // Insufficient permissions
      404: ErrorSchema, // Organization not found
      500: ErrorSchema,
    },
    summary: 'List pending invitations for an organization',
  },

  /**
   * Revoke a pending invitation.
   * Requires admin/owner permissions in the invitation's organization.
   */
  revoke: {
    method: 'DELETE',
    path: '/api/invitations/:invitationId',
    pathParams: z.object({
      invitationId: z.string().uuid(),
    }),
    body: z.undefined(),
    responses: {
      204: z.undefined(), // Success, no content
      401: ErrorSchema, // Not authenticated
      403: ErrorSchema, // Insufficient permissions
      404: ErrorSchema, // Invitation not found
      500: ErrorSchema,
    },
    summary: 'Revoke a pending invitation',
  },
}, {
  strictStatusCodes: true,
});

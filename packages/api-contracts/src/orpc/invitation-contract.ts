import { oc } from '@orpc/contract';
import { openapi } from '@orpc/openapi';
import { z } from 'zod';
import {
  AcceptInvitationSchema,
  CreateInvitationSchema,
  InvitationSchema,
  ValidateInvitationSchema,
} from '../schemas/invitation.js';

const organizationId = z.object({
  organizationId: z.string().uuid(),
});

const invitationId = z.object({
  invitationId: z.string().uuid(),
});

export const invitationOrpcContract = oc.router({
  create: oc
    .meta(
      openapi({
        method: 'POST',
        path: '/api/invitations',
        successStatus: 201,
        summary: 'Create a new invitation to join an organization',
      })
    )
    .input(CreateInvitationSchema)
    .output(InvitationSchema),
  validate: oc
    .meta(
      openapi({
        method: 'POST',
        path: '/api/invitations/validate',
        summary: 'Validate an invitation code before accepting',
      })
    )
    .input(ValidateInvitationSchema)
    .output(InvitationSchema),
  accept: oc
    .meta(
      openapi({
        method: 'POST',
        path: '/api/invitations/accept',
        summary: 'Accept an invitation and join the organization',
      })
    )
    .input(AcceptInvitationSchema)
    .output(InvitationSchema),
  listPending: oc
    .meta(
      openapi({
        method: 'GET',
        path: '/api/organizations/{organizationId}/invitations',
        summary: 'List pending invitations for an organization',
      })
    )
    .input(organizationId)
    .output(
      z.object({
        invitations: z.array(InvitationSchema),
      })
    ),
  revoke: oc
    .meta(
      openapi({
        method: 'DELETE',
        path: '/api/invitations/{invitationId}',
        successStatus: 204,
        summary: 'Revoke a pending invitation',
      })
    )
    .input(invitationId)
    .output(z.void()),
});

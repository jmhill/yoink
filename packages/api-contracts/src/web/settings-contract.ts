import { oc } from '@orpc/contract';
import { openapi } from '@orpc/openapi';
import { z } from 'zod';
import {
  CreateInvitationSchema,
  InvitationSchema,
} from '../schemas/invitation.js';
import {
  ChangeMemberRoleRequestSchema,
  ChangeMemberRoleResponseSchema,
  CreateAgentRequestSchema,
  CreateAgentResponseSchema,
  LeaveOrganizationResponseSchema,
  ListMembersResponseSchema,
  SwitchOrganizationRequestSchema,
  SwitchOrganizationResponseSchema,
  TransferOwnershipRequestSchema,
  TransferOwnershipResponseSchema,
} from '../schemas/organization.js';
import {
  CreateUserTokenRequestSchema,
  CreateUserTokenResponseSchema,
  DeleteUserTokenResponseSchema,
  ListUserTokensResponseSchema,
  ReissueAgentTokenResponseSchema,
} from '../schemas/token.js';

const organizationId = z.object({
  organizationId: z.string().uuid(),
});

const memberParams = z.object({
  organizationId: z.string().uuid(),
  userId: z.string().uuid(),
});

const invitationId = z.object({
  invitationId: z.string().uuid(),
});

const tokenId = z.object({
  tokenId: z.string(),
});

/**
 * Settings and organizations. Paths are the resource after `/web-api`.
 * Passkeys, login, signup, and join validate/accept are the auth contract.
 */
export const webSettingsContract = oc.router({
  switchOrganization: oc
    .meta(
      openapi({
        method: 'POST',
        path: '/organizations/switch',
        summary: 'Switch the current organization',
      })
    )
    .input(SwitchOrganizationRequestSchema)
    .output(SwitchOrganizationResponseSchema),
  leave: oc
    .meta(
      openapi({
        method: 'POST',
        path: '/organizations/{organizationId}/leave',
        summary: 'Leave an organization',
      })
    )
    .input(organizationId)
    .output(LeaveOrganizationResponseSchema),
  transferOwner: oc
    .meta(
      openapi({
        method: 'POST',
        path: '/organizations/{organizationId}/owner/transfer',
        summary: 'Hand over workspace ownership',
      })
    )
    .input(organizationId.merge(TransferOwnershipRequestSchema))
    .output(TransferOwnershipResponseSchema),
  listMembers: oc
    .meta(
      openapi({
        method: 'GET',
        path: '/organizations/{organizationId}/members',
        summary: 'List organization members',
      })
    )
    .input(organizationId)
    .output(ListMembersResponseSchema),
  changeMemberRole: oc
    .meta(
      openapi({
        method: 'PATCH',
        path: '/organizations/{organizationId}/members/{userId}/role',
        summary: 'Change a member role between admin and member',
      })
    )
    .input(memberParams.merge(ChangeMemberRoleRequestSchema))
    .output(ChangeMemberRoleResponseSchema),
  removeMember: oc
    .meta(
      openapi({
        method: 'DELETE',
        path: '/organizations/{organizationId}/members/{userId}',
        successStatus: 204,
        summary: 'Remove a member from an organization',
      })
    )
    .input(memberParams)
    .output(z.void()),
  createAgent: oc
    .meta(
      openapi({
        method: 'POST',
        path: '/organizations/{organizationId}/agents',
        successStatus: 201,
        summary: 'Mint an agent member and return its API token once',
      })
    )
    .input(organizationId.merge(CreateAgentRequestSchema))
    .output(CreateAgentResponseSchema),
  reissueAgentToken: oc
    .meta(
      openapi({
        method: 'POST',
        path: '/organizations/{organizationId}/members/{userId}/token',
        successStatus: 201,
        summary: 'Issue a new token for an existing agent member',
      })
    )
    .input(memberParams.merge(z.object({})))
    .output(ReissueAgentTokenResponseSchema),
  createInvitation: oc
    .meta(
      openapi({
        method: 'POST',
        path: '/invitations',
        successStatus: 201,
        summary: 'Invite someone to the current organization',
      })
    )
    .input(CreateInvitationSchema)
    .output(InvitationSchema),
  listPendingInvitations: oc
    .meta(
      openapi({
        method: 'GET',
        path: '/organizations/{organizationId}/invitations',
        summary: 'List pending invitations for an organization',
      })
    )
    .input(organizationId)
    .output(z.object({ invitations: z.array(InvitationSchema) })),
  revokeInvitation: oc
    .meta(
      openapi({
        method: 'DELETE',
        path: '/invitations/{invitationId}',
        successStatus: 204,
        summary: 'Revoke a pending invitation',
      })
    )
    .input(invitationId)
    .output(z.void()),
  listTokens: oc
    .meta(
      openapi({
        method: 'GET',
        path: '/auth/tokens',
        summary: 'List API tokens for the current user and organization',
      })
    )
    .output(ListUserTokensResponseSchema),
  createToken: oc
    .meta(
      openapi({
        method: 'POST',
        path: '/auth/tokens',
        successStatus: 201,
        summary: 'Create an API token',
      })
    )
    .input(CreateUserTokenRequestSchema)
    .output(CreateUserTokenResponseSchema),
  deleteToken: oc
    .meta(
      openapi({
        method: 'DELETE',
        path: '/auth/tokens/{tokenId}',
        summary: 'Revoke an API token',
      })
    )
    .input(tokenId)
    .output(DeleteUserTokenResponseSchema),
});

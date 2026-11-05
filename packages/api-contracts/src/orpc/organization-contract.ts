import { oc } from '@orpc/contract';
import { openapi } from '@orpc/openapi';
import { z } from 'zod';
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
import { ReissueAgentTokenResponseSchema } from '../schemas/token.js';

const organizationId = z.object({
  organizationId: z.string().uuid(),
});

const memberParams = z.object({
  organizationId: z.string().uuid(),
  userId: z.string().uuid(),
});

export const organizationOrpcContract = oc.router({
  switch: oc
    .meta(
      openapi({
        method: 'POST',
        path: '/api/organizations/switch',
        summary: 'Switch current organization',
      })
    )
    .input(SwitchOrganizationRequestSchema)
    .output(SwitchOrganizationResponseSchema),
  leave: oc
    .meta(
      openapi({
        method: 'POST',
        path: '/api/organizations/{organizationId}/leave',
        summary: 'Leave an organization',
      })
    )
    .input(organizationId)
    .output(LeaveOrganizationResponseSchema),
  transferOwner: oc
    .meta(
      openapi({
        method: 'POST',
        path: '/api/organizations/{organizationId}/owner/transfer',
        summary: 'Hand over workspace ownership',
      })
    )
    .input(organizationId.merge(TransferOwnershipRequestSchema))
    .output(TransferOwnershipResponseSchema),
  listMembers: oc
    .meta(
      openapi({
        method: 'GET',
        path: '/api/organizations/{organizationId}/members',
        summary: 'List organization members',
      })
    )
    .input(organizationId)
    .output(ListMembersResponseSchema),
  changeMemberRole: oc
    .meta(
      openapi({
        method: 'PATCH',
        path: '/api/organizations/{organizationId}/members/{userId}/role',
        summary: 'Change a member role between admin and member',
      })
    )
    .input(memberParams.merge(ChangeMemberRoleRequestSchema))
    .output(ChangeMemberRoleResponseSchema),
  removeMember: oc
    .meta(
      openapi({
        method: 'DELETE',
        path: '/api/organizations/{organizationId}/members/{userId}',
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
        path: '/api/organizations/{organizationId}/agents',
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
        path: '/api/organizations/{organizationId}/members/{userId}/token',
        successStatus: 201,
        summary: 'Issue a new token for an existing agent member',
      })
    )
    .input(memberParams.merge(z.object({})))
    .output(ReissueAgentTokenResponseSchema),
});

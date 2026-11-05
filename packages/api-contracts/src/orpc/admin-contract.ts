import { oc } from '@orpc/contract';
import { openapi } from '@orpc/openapi';
import { z } from 'zod';
import {
  AdminCreateInvitationSchema,
  AdminInvitationResponseSchema,
  AdminWorkspaceListItemSchema,
  ApiTokenSchema,
  CreateOrganizationSchema,
  CreateTokenResponseSchema,
  CreateTokenSchema,
  CreateUserSchema,
  CreateWorkspaceResponseSchema,
  GetOwnerInvitationResponseSchema,
  IssueOwnerInvitationRequestSchema,
  IssueOwnerInvitationResponseSchema,
  LoginRequestSchema,
  LoginResponseSchema,
  OrganizationSchema,
  PatchMemberRoleSchema,
  SessionResponseSchema,
  SetOrganizationOwnerSchema,
  UpdateOrganizationSchema,
  UpdateProjectCreatedAtSchema,
  UpdateUserSchema,
  UserSchema,
} from '../schemas/admin.js';
import { ProjectSchema } from '../schemas/project.js';

const idParam = z.object({
  id: z.string().uuid(),
});

const organizationId = z.object({
  organizationId: z.string().uuid(),
});

const memberParams = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
});

export const adminPublicOrpcContract = oc.router({
  login: oc
    .meta(
      openapi({
        method: 'POST',
        path: '/api/admin/login',
        summary: 'Login to admin panel',
      })
    )
    .input(LoginRequestSchema)
    .output(LoginResponseSchema),
  logout: oc
    .meta(
      openapi({
        method: 'POST',
        path: '/api/admin/logout',
        summary: 'Logout from admin panel',
      })
    )
    .input(z.union([z.object({}), z.null(), z.undefined()]))
    .output(LoginResponseSchema),
});

export const adminProtectedOrpcContract = oc.router({
  getSession: oc
    .meta(
      openapi({
        method: 'GET',
        path: '/api/admin/session',
        summary: 'Check if session is valid',
      })
    )
    .output(SessionResponseSchema),
  listOrganizations: oc
    .meta(
      openapi({
        method: 'GET',
        path: '/api/admin/organizations',
        summary: 'List all organizations',
      })
    )
    .output(
      z.object({
        organizations: z.array(AdminWorkspaceListItemSchema),
      })
    ),
  createOrganization: oc
    .meta(
      openapi({
        method: 'POST',
        path: '/api/admin/organizations',
        successStatus: 201,
        summary:
          'Create a workspace. Existing account becomes owner in the same save; otherwise an owner invite is issued.',
      })
    )
    .input(CreateOrganizationSchema)
    .output(CreateWorkspaceResponseSchema),
  issueOwnerInvitation: oc
    .meta(
      openapi({
        method: 'POST',
        path: '/api/admin/organizations/{id}/owner-invitation',
        successStatus: 201,
        summary:
          'Issue or replace the pending owner invite. An existing account becomes owner in the same save.',
      })
    )
    .input(idParam.merge(IssueOwnerInvitationRequestSchema))
    .output(IssueOwnerInvitationResponseSchema),
  getOwnerInvitation: oc
    .meta(
      openapi({
        method: 'GET',
        path: '/api/admin/organizations/{id}/owner-invitation',
        summary: 'Get the pending owner invite for a workspace, if any.',
      })
    )
    .input(idParam)
    .output(GetOwnerInvitationResponseSchema),
  getOrganization: oc
    .meta(
      openapi({
        method: 'GET',
        path: '/api/admin/organizations/{id}',
        summary: 'Get an organization by ID',
      })
    )
    .input(idParam)
    .output(OrganizationSchema),
  updateOrganization: oc
    .meta(
      openapi({
        method: 'PATCH',
        path: '/api/admin/organizations/{id}',
        summary: 'Update an organization',
      })
    )
    .input(idParam.merge(UpdateOrganizationSchema))
    .output(OrganizationSchema),
  listUsers: oc
    .meta(
      openapi({
        method: 'GET',
        path: '/api/admin/organizations/{organizationId}/users',
        summary: 'List users in an organization',
      })
    )
    .input(organizationId)
    .output(
      z.object({
        users: z.array(UserSchema),
      })
    ),
  createUser: oc
    .meta(
      openapi({
        method: 'POST',
        path: '/api/admin/organizations/{organizationId}/users',
        successStatus: 201,
        summary: 'Create a system user in an organization (for API integrations)',
      })
    )
    .input(organizationId.merge(CreateUserSchema))
    .output(UserSchema),
  setOrganizationOwner: oc
    .meta(
      openapi({
        method: 'PUT',
        path: '/api/admin/organizations/{id}/owner',
        summary: 'Set the workspace owner. The previous owner becomes admin in the same save.',
      })
    )
    .input(idParam.merge(SetOrganizationOwnerSchema))
    .output(UserSchema),
  changeMemberRole: oc
    .meta(
      openapi({
        method: 'PATCH',
        path: '/api/admin/organizations/{id}/members/{userId}',
        summary: 'Change a member between admin and member. Cannot assign or change owner.',
      })
    )
    .input(memberParams.merge(PatchMemberRoleSchema))
    .output(UserSchema),
  getUser: oc
    .meta(
      openapi({
        method: 'GET',
        path: '/api/admin/users/{id}',
        summary: 'Get a user by ID',
      })
    )
    .input(idParam)
    .output(UserSchema),
  updateUser: oc
    .meta(
      openapi({
        method: 'PATCH',
        path: '/api/admin/users/{id}',
        summary: 'Update a user display name',
      })
    )
    .input(idParam.merge(UpdateUserSchema))
    .output(UserSchema),
  updateProjectCreatedAt: oc
    .meta(
      openapi({
        method: 'PATCH',
        path: '/api/admin/projects/{id}',
        summary: 'Back-date a project createdAt for history-start fixtures',
      })
    )
    .input(idParam.merge(UpdateProjectCreatedAtSchema))
    .output(ProjectSchema),
  listTokens: oc
    .meta(
      openapi({
        method: 'GET',
        path: '/api/admin/organizations/{organizationId}/tokens',
        summary: 'List tokens for an organization',
      })
    )
    .input(organizationId)
    .output(
      z.object({
        tokens: z.array(ApiTokenSchema),
      })
    ),
  createToken: oc
    .meta(
      openapi({
        method: 'POST',
        path: '/api/admin/organizations/{organizationId}/tokens',
        successStatus: 201,
        summary: 'Create a new API token for a user in an organization',
      })
    )
    .input(organizationId.merge(CreateTokenSchema))
    .output(CreateTokenResponseSchema),
  revokeToken: oc
    .meta(
      openapi({
        method: 'DELETE',
        path: '/api/admin/tokens/{id}',
        successStatus: 204,
        summary: 'Revoke (delete) an API token (idempotent)',
      })
    )
    .input(idParam)
    .output(z.void()),
  createInvitation: oc
    .meta(
      openapi({
        method: 'POST',
        path: '/api/admin/organizations/{organizationId}/invitations',
        successStatus: 201,
        summary: 'Create an invitation to join an organization',
      })
    )
    .input(organizationId.merge(AdminCreateInvitationSchema))
    .output(AdminInvitationResponseSchema),
});

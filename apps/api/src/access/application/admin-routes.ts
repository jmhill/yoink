import type { FastifyInstance } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { OpenAPIHandler } from '@orpc/openapi/fastify';
import { implement } from '@orpc/server';
import {
  CREATE_OWNER_INVITE_STORAGE_MESSAGE,
  OWNER_EMAIL_REQUIRED_MESSAGE,
  THERE_HAS_TO_BE_AT_LEAST_ONE_ADMIN_MESSAGE,
} from '@yoink/api-contracts';
import { adminProtectedOrpcContract, adminPublicOrpcContract } from '@yoink/api-contracts/orpc';
import type { AdminService } from '../domain/admin-service.js';
import type { AdminServiceError } from '../domain/admin-errors.js';
import type { AdminSessionService } from '../domain/admin-session-service.js';
import type { InvitationService } from '../domain/invitation-service.js';
import type { Invitation } from '../domain/invitation.js';
import type { User } from '../domain/user.js';
import { ADMIN_SESSION_COOKIE, createAdminSessionMiddleware } from './admin-session-middleware.js';
import type { RateLimitConfig, CookieConfig } from '../../platform/config/schema.js';
import {
  namedRequestValidationError,
  validationIssuePaths,
  type RequestValidationErr,
} from '../../edges/_shared/request-validation.js';
import type { ClientIpOf } from '../../edges/_shared/request-client-ip.js';
import type { handleCreateWorkspace } from './handle-create-workspace.js';
import type { handleIssueOwnerInvitation } from './handle-issue-owner-invitation.js';
import type { handleGetOwnerInvitation } from './handle-get-owner-invitation.js';
import type { handleListWorkspaces } from './handle-list-workspaces.js';
import type { HandleListWorkspacesError } from './handle-list-workspaces.js';
import { dispatchOrpc } from '../../edges/_shared/orpc/dispatch.js';
import {
  openApiHandlerOptions,
  yoinkOpenApiHandlerOptions,
} from '../../edges/_shared/orpc/handler-options.js';
import type { OrpcHttpContext } from '../../edges/_shared/orpc/http-context.js';
import {
  accessHttpError,
  accessInternalError,
  accessStorageError,
  adminCreateInvitationErrorResponse,
  createWorkspaceErrorResponse,
  issueOwnerInvitationErrorResponse,
  loggedCause,
} from './access-http-errors.js';

export type AdminRoutesDependencies = {
  adminService: AdminService;
  adminSessionService: AdminSessionService;
  invitationService: InvitationService;
  createWorkspace: (
    command: Parameters<typeof handleCreateWorkspace>[0]
  ) => ReturnType<typeof handleCreateWorkspace>;
  issueOwnerInvitation: (
    command: Parameters<typeof handleIssueOwnerInvitation>[0]
  ) => ReturnType<typeof handleIssueOwnerInvitation>;
  getOwnerInvitation: (
    organizationId: Parameters<typeof handleGetOwnerInvitation>[0]
  ) => ReturnType<typeof handleGetOwnerInvitation>;
  listWorkspaces: (
    query: Parameters<typeof handleListWorkspaces>[0]
  ) => ReturnType<typeof handleListWorkspaces>;
  cookieConfig: CookieConfig;
  clientIpOf: ClientIpOf;
};

const storageErrorResponse = (error: unknown, message: string) =>
  accessStorageError(loggedCause(error), message);

const listWorkspacesErrorResponse = (error: HandleListWorkspacesError) => {
  switch (error.type) {
    case 'WORKSPACE_ROW_INVALID':
    case 'LIST_WORKSPACES_FAILED':
      return accessStorageError(
        loggedCause(error),
        'Failed to list organizations',
        'Failed to list organizations',
        error.type
      );
    default: {
      const _never: never = error;
      void _never;
      return accessStorageError(
        loggedCause(error),
        'Failed to list organizations',
        'Failed to list organizations',
        'LIST_WORKSPACES_FAILED'
      );
    }
  }
};

const toOwnerInvitationSummary = (invitation: Invitation) => ({
  id: invitation.id,
  code: invitation.code,
  email: invitation.email ?? '',
  expiresAt: invitation.expiresAt,
});

const toOwnerUser = (owner: User) => ({
  id: owner.id,
  email: owner.email,
  name: owner.name,
  kind: owner.kind,
  role: 'owner' as const,
  createdAt: owner.createdAt,
});

const setOrganizationOwnerErrorResponse = (error: AdminServiceError) => {
  switch (error.type) {
    case 'ORGANIZATION_NOT_FOUND':
      return accessHttpError({ code: 'NOT_FOUND', message: 'Organization not found' });
    case 'USER_NOT_FOUND':
      return accessHttpError({ code: 'NOT_FOUND', message: 'User not found' });
    case 'TARGET_NOT_WORKSPACE_MEMBER':
      return accessHttpError({
        code: 'BAD_REQUEST',
        message: error.message,
        bodyCode: error.type,
      });
    case 'BOT_CANNOT_HAVE_PRIVILEGED_ROLE':
      return accessHttpError({
        code: 'BAD_REQUEST',
        message: error.message,
        bodyCode: error.type,
      });
    case 'OWNER_MUST_TRANSFER':
      return accessHttpError({
        code: 'CONFLICT',
        message: error.message,
        bodyCode: error.type,
      });
    case 'ORGANIZATION_STORAGE_ERROR':
    case 'MEMBERSHIP_STORAGE_ERROR':
    case 'USER_STORAGE_ERROR':
    case 'TOKEN_STORAGE_ERROR':
    case 'TOKEN_NOT_FOUND':
    case 'INVALID_TOKEN_NAME':
    case 'PROJECT_NOT_FOUND':
    case 'STORAGE_ERROR':
    case 'CANNOT_ASSIGN_OWNER_ROLE':
    case 'LAST_ADMIN':
    case 'MEMBERSHIP_NOT_FOUND':
    case 'BOT_CANNOT_CHANGE_ROLES':
    case 'ROLE_CHANGE_NOT_ALLOWED':
    case 'CANNOT_CHANGE_OWN_ROLE':
    case 'OWNER_ROLE_LOCKED':
      return storageErrorResponse(error, 'Failed to set owner');
    default: {
      const _never: never = error;
      return storageErrorResponse(_never, 'Failed to set owner');
    }
  }
};

const changeMemberRoleErrorResponse = (error: AdminServiceError) => {
  switch (error.type) {
    case 'ORGANIZATION_NOT_FOUND':
      return accessHttpError({ code: 'NOT_FOUND', message: 'Organization not found' });
    case 'USER_NOT_FOUND':
    case 'TARGET_NOT_WORKSPACE_MEMBER':
    case 'MEMBERSHIP_NOT_FOUND':
      return accessHttpError({ code: 'NOT_FOUND', message: 'Member not found' });
    case 'BOT_CANNOT_HAVE_PRIVILEGED_ROLE':
    case 'CANNOT_ASSIGN_OWNER_ROLE':
      return accessHttpError({
        code: 'BAD_REQUEST',
        message: error.message,
        bodyCode: error.type,
      });
    case 'OWNER_MUST_TRANSFER':
      return accessHttpError({
        code: 'CONFLICT',
        message: error.message,
        bodyCode: error.type,
      });
    case 'LAST_ADMIN':
      return accessHttpError({
        code: 'CONFLICT',
        message: THERE_HAS_TO_BE_AT_LEAST_ONE_ADMIN_MESSAGE,
        bodyCode: error.type,
      });
    case 'ORGANIZATION_STORAGE_ERROR':
    case 'MEMBERSHIP_STORAGE_ERROR':
    case 'USER_STORAGE_ERROR':
    case 'TOKEN_STORAGE_ERROR':
    case 'TOKEN_NOT_FOUND':
    case 'INVALID_TOKEN_NAME':
    case 'PROJECT_NOT_FOUND':
    case 'STORAGE_ERROR':
    case 'BOT_CANNOT_CHANGE_ROLES':
    case 'ROLE_CHANGE_NOT_ALLOWED':
    case 'CANNOT_CHANGE_OWN_ROLE':
    case 'OWNER_ROLE_LOCKED':
      return storageErrorResponse(error, 'Failed to change member role');
    default: {
      const _never: never = error;
      return storageErrorResponse(_never, 'Failed to change member role');
    }
  }
};

const createUserErrorResponse = (error: AdminServiceError) => {
  switch (error.type) {
    case 'ORGANIZATION_STORAGE_ERROR':
      if (error.message === 'Organization not found') {
        return accessHttpError({ code: 'NOT_FOUND', message: 'Organization not found' });
      }
      return storageErrorResponse(error, 'Failed to create user');
    case 'BOT_CANNOT_HAVE_PRIVILEGED_ROLE':
      return accessHttpError({
        code: 'BAD_REQUEST',
        message: error.message,
        bodyCode: error.type,
      });
    case 'MEMBERSHIP_STORAGE_ERROR':
    case 'USER_STORAGE_ERROR':
    case 'TOKEN_STORAGE_ERROR':
    case 'ORGANIZATION_NOT_FOUND':
    case 'USER_NOT_FOUND':
    case 'TOKEN_NOT_FOUND':
    case 'INVALID_TOKEN_NAME':
    case 'PROJECT_NOT_FOUND':
    case 'STORAGE_ERROR':
    case 'CANNOT_ASSIGN_OWNER_ROLE':
    case 'LAST_ADMIN':
    case 'MEMBERSHIP_NOT_FOUND':
    case 'OWNER_MUST_TRANSFER':
    case 'TARGET_NOT_WORKSPACE_MEMBER':
    case 'BOT_CANNOT_CHANGE_ROLES':
    case 'ROLE_CHANGE_NOT_ALLOWED':
    case 'CANNOT_CHANGE_OWN_ROLE':
    case 'OWNER_ROLE_LOCKED':
      return storageErrorResponse(error, 'Failed to create user');
    default: {
      const _never: never = error;
      return storageErrorResponse(_never, 'Failed to create user');
    }
  }
};

const updateUserErrorResponse = (error: AdminServiceError) => {
  switch (error.type) {
    case 'USER_NOT_FOUND':
      return accessHttpError({ code: 'NOT_FOUND', message: 'User not found' });
    case 'ORGANIZATION_STORAGE_ERROR':
    case 'MEMBERSHIP_STORAGE_ERROR':
    case 'USER_STORAGE_ERROR':
    case 'TOKEN_STORAGE_ERROR':
    case 'ORGANIZATION_NOT_FOUND':
    case 'TOKEN_NOT_FOUND':
    case 'INVALID_TOKEN_NAME':
    case 'PROJECT_NOT_FOUND':
    case 'STORAGE_ERROR':
    case 'BOT_CANNOT_HAVE_PRIVILEGED_ROLE':
    case 'CANNOT_ASSIGN_OWNER_ROLE':
    case 'LAST_ADMIN':
    case 'MEMBERSHIP_NOT_FOUND':
    case 'OWNER_MUST_TRANSFER':
    case 'TARGET_NOT_WORKSPACE_MEMBER':
    case 'BOT_CANNOT_CHANGE_ROLES':
    case 'ROLE_CHANGE_NOT_ALLOWED':
    case 'CANNOT_CHANGE_OWN_ROLE':
    case 'OWNER_ROLE_LOCKED':
      return storageErrorResponse(error, 'Failed to update user');
    default: {
      const _never: never = error;
      return storageErrorResponse(_never, 'Failed to update user');
    }
  }
};

const updateProjectErrorResponse = (error: AdminServiceError) => {
  switch (error.type) {
    case 'PROJECT_NOT_FOUND':
      return accessHttpError({ code: 'NOT_FOUND', message: 'Project not found' });
    case 'ORGANIZATION_STORAGE_ERROR':
    case 'MEMBERSHIP_STORAGE_ERROR':
    case 'USER_STORAGE_ERROR':
    case 'TOKEN_STORAGE_ERROR':
    case 'ORGANIZATION_NOT_FOUND':
    case 'USER_NOT_FOUND':
    case 'TOKEN_NOT_FOUND':
    case 'INVALID_TOKEN_NAME':
    case 'STORAGE_ERROR':
    case 'BOT_CANNOT_HAVE_PRIVILEGED_ROLE':
    case 'CANNOT_ASSIGN_OWNER_ROLE':
    case 'LAST_ADMIN':
    case 'MEMBERSHIP_NOT_FOUND':
    case 'OWNER_MUST_TRANSFER':
    case 'TARGET_NOT_WORKSPACE_MEMBER':
    case 'BOT_CANNOT_CHANGE_ROLES':
    case 'ROLE_CHANGE_NOT_ALLOWED':
    case 'CANNOT_CHANGE_OWN_ROLE':
    case 'OWNER_ROLE_LOCKED':
      return storageErrorResponse(error, 'Failed to update project');
    default: {
      const _never: never = error;
      return storageErrorResponse(_never, 'Failed to update project');
    }
  }
};

const adminProtectedValidation = (err: RequestValidationErr) => {
  if (validationIssuePaths(err).includes('ownerEmail')) {
    return {
      message: OWNER_EMAIL_REQUIRED_MESSAGE,
      code: 'VALIDATION_FAILED',
    };
  }
  return namedRequestValidationError(err);
};

export const registerAdminRoutes = async (
  app: FastifyInstance,
  deps: AdminRoutesDependencies,
  rateLimitConfig: RateLimitConfig
) => {
  const {
    adminService,
    adminSessionService,
    invitationService,
    createWorkspace,
    issueOwnerInvitation,
    getOwnerInvitation,
    listWorkspaces,
    cookieConfig,
    clientIpOf,
  } = deps;

  const requireOrganization = async (organizationId: string, storageMessage: string) => {
    const orgResult = await adminService.getOrganization(organizationId);
    if (orgResult.isErr()) {
      throw storageErrorResponse(orgResult.error, storageMessage);
    }
    if (orgResult.value === null) {
      throw accessHttpError({ code: 'NOT_FOUND', message: 'Organization not found' });
    }
    return orgResult.value;
  };

  const publicContract = implement(adminPublicOrpcContract).$context<OrpcHttpContext>();
  const publicRouter = publicContract.router({
    login: publicContract.login.handler(async ({ input, context }) => {
      const result = adminSessionService.login(input.password);
      if (!result.success) {
        throw accessHttpError({ code: 'UNAUTHORIZED', message: 'Invalid password' });
      }
      if (typeof result.sessionToken !== 'string') {
        throw accessInternalError(result);
      }

      context.reply.setCookie(ADMIN_SESSION_COOKIE, result.sessionToken, {
        httpOnly: true,
        secure: cookieConfig.secure,
        sameSite: 'strict',
        path: '/',
        maxAge: 24 * 60 * 60,
      });

      return { success: true };
    }),
    logout: publicContract.logout.handler(async ({ context }) => {
      context.reply.clearCookie(ADMIN_SESSION_COOKIE, {
        path: '/',
      });
      return { success: true };
    }),
  });

  const protectedContract = implement(adminProtectedOrpcContract).$context<OrpcHttpContext>();
  const protectedRouter = protectedContract.router({
    getSession: protectedContract.getSession.handler(async () => ({ authenticated: true })),
    listOrganizations: protectedContract.listOrganizations.handler(async () => {
      const result = await listWorkspaces({ type: 'ListWorkspaces' });
      return result.match(
        (workspaces) => ({
          organizations: workspaces.map((workspace) => ({
            id: workspace.organization.id,
            name: workspace.organization.name,
            createdAt: workspace.organization.createdAt,
            personal: workspace.personal,
            ownerStatus: workspace.ownerStatus,
          })),
        }),
        (error) => {
          throw listWorkspacesErrorResponse(error);
        }
      );
    }),
    createOrganization: protectedContract.createOrganization.handler(async ({ input }) => {
      const result = await createWorkspace({
        name: input.name,
        ownerEmail: input.ownerEmail,
      });
      return result.match(
        (created) => {
          if (created.kind === 'owner-assigned') {
            return {
              organization: created.organization,
              owner: toOwnerUser(created.owner),
              ownerInvitation: null,
            };
          }
          return {
            organization: created.organization,
            owner: null,
            ownerInvitation: toOwnerInvitationSummary(created.invitation),
          };
        },
        (error) => {
          throw createWorkspaceErrorResponse(error);
        }
      );
    }),
    issueOwnerInvitation: protectedContract.issueOwnerInvitation.handler(async ({ input }) => {
      const result = await issueOwnerInvitation({
        organizationId: input.id,
        email: input.email,
      });
      return result.match(
        (issued) => {
          if (issued.kind === 'owner-assigned') {
            return {
              owner: toOwnerUser(issued.owner),
              ownerInvitation: null,
            };
          }
          return {
            owner: null,
            ownerInvitation: toOwnerInvitationSummary(issued.invitation),
          };
        },
        (error) => {
          throw issueOwnerInvitationErrorResponse(error);
        }
      );
    }),
    getOwnerInvitation: protectedContract.getOwnerInvitation.handler(async ({ input }) => {
      const result = await getOwnerInvitation(input.id);
      return result.match(
        (read) => ({
          ownerInvitation: read.ownerInvitation
            ? toOwnerInvitationSummary(read.ownerInvitation)
            : null,
          expiredOwnerInvitation: read.expiredOwnerInvitation,
          personal: read.personal,
        }),
        (error) => {
          switch (error.type) {
            case 'ORGANIZATION_NOT_FOUND':
              throw accessHttpError({
                code: 'NOT_FOUND',
                message: 'Organization not found',
                bodyCode: error.type,
              });
            case 'ISSUE_OWNER_INVITATION_FAILED':
            case 'WORKSPACE_ROW_INVALID':
              throw storageErrorResponse(error, CREATE_OWNER_INVITE_STORAGE_MESSAGE);
            default: {
              const _never: never = error;
              throw storageErrorResponse(_never, CREATE_OWNER_INVITE_STORAGE_MESSAGE);
            }
          }
        }
      );
    }),
    getOrganization: protectedContract.getOrganization.handler(async ({ input }) => {
      const result = await adminService.getOrganization(input.id);
      return result.match(
        (organization) => {
          if (!organization) {
            throw accessHttpError({ code: 'NOT_FOUND', message: 'Organization not found' });
          }
          return organization;
        },
        (error) => {
          throw storageErrorResponse(error, 'Failed to get organization');
        }
      );
    }),
    updateOrganization: protectedContract.updateOrganization.handler(async ({ input }) => {
      const result = await adminService.renameOrganization(input.id, input.name);
      return result.match(
        (organization) => {
          if (!organization) {
            throw accessHttpError({ code: 'NOT_FOUND', message: 'Organization not found' });
          }
          return organization;
        },
        (error) => {
          throw storageErrorResponse(error, 'Failed to update organization');
        }
      );
    }),
    listUsers: protectedContract.listUsers.handler(async ({ input }) => {
      await requireOrganization(input.organizationId, 'Failed to check organization');
      const result = await adminService.listUsers(input.organizationId);
      return result.match(
        (users) => ({ users }),
        (error) => {
          throw storageErrorResponse(error, 'Failed to list users');
        }
      );
    }),
    createUser: protectedContract.createUser.handler(async ({ input }) => {
      const result = await adminService.createUser({
        organizationId: input.organizationId,
        email: input.email,
        role: input.role,
        kind: input.kind,
        name: input.name,
      });
      return result.match(
        (user) => user,
        (error) => {
          throw createUserErrorResponse(error);
        }
      );
    }),
    setOrganizationOwner: protectedContract.setOrganizationOwner.handler(async ({ input }) => {
      const result = await adminService.setOrganizationOwner({
        organizationId: input.id,
        userId: input.userId,
      });
      return result.match(
        (member) => member,
        (error) => {
          throw setOrganizationOwnerErrorResponse(error);
        }
      );
    }),
    changeMemberRole: protectedContract.changeMemberRole.handler(async ({ input }) => {
      const result = await adminService.changeMemberRole({
        organizationId: input.id,
        userId: input.userId,
        role: input.role,
      });
      return result.match(
        (member) => member,
        (error) => {
          throw changeMemberRoleErrorResponse(error);
        }
      );
    }),
    getUser: protectedContract.getUser.handler(async ({ input }) => {
      const result = await adminService.getUser(input.id);
      return result.match(
        (user) => {
          if (!user) {
            throw accessHttpError({ code: 'NOT_FOUND', message: 'User not found' });
          }
          return user;
        },
        (error) => {
          throw storageErrorResponse(error, 'Failed to get user');
        }
      );
    }),
    updateUser: protectedContract.updateUser.handler(async ({ input }) => {
      const result = await adminService.updateUser(input.id, input.name);
      return result.match(
        (user) => user,
        (error) => {
          throw updateUserErrorResponse(error);
        }
      );
    }),
    updateProjectCreatedAt: protectedContract.updateProjectCreatedAt.handler(
      async ({ input }) => {
        const result = await adminService.updateProjectCreatedAt(input.id, input.createdAt);
        return result.match(
          (project) => project,
          (error) => {
            throw updateProjectErrorResponse(error);
          }
        );
      }
    ),
    listTokens: protectedContract.listTokens.handler(async ({ input }) => {
      await requireOrganization(input.organizationId, 'Failed to check organization');
      const result = await adminService.listTokens(input.organizationId);
      return result.match(
        (tokens) => ({ tokens }),
        (error) => {
          throw storageErrorResponse(error, 'Failed to list tokens');
        }
      );
    }),
    createToken: protectedContract.createToken.handler(async ({ input }) => {
      await requireOrganization(input.organizationId, 'Failed to check organization');
      const userResult = await adminService.getUser(input.userId);
      if (userResult.isErr()) {
        throw storageErrorResponse(userResult.error, 'Failed to check user');
      }
      if (userResult.value === null) {
        throw accessHttpError({ code: 'NOT_FOUND', message: 'User not found' });
      }

      const result = await adminService.createToken({
        organizationId: input.organizationId,
        userId: input.userId,
        name: input.name,
      });
      return result.match(
        (tokenResult) => ({
          token: tokenResult.token,
          rawToken: tokenResult.rawToken,
        }),
        (error) => {
          throw storageErrorResponse(error, 'Failed to create token');
        }
      );
    }),
    revokeToken: protectedContract.revokeToken.handler(async ({ input }) => {
      const result = await adminService.revokeToken(input.id);
      return result.match(
        () => undefined,
        (error) => {
          throw storageErrorResponse(error, 'Failed to revoke token');
        }
      );
    }),
    createInvitation: protectedContract.createInvitation.handler(async ({ input }) => {
      const result = await invitationService.createInvitation({
        organizationId: input.organizationId,
        invitedByUserId: null,
        role: input.role ?? 'member',
        email: input.email,
        expiresInDays: input.expiresInDays,
        skipPermissionCheck: true,
      });
      return result.match(
        (invitation) => ({
          id: invitation.id,
          code: invitation.code,
          email: invitation.email,
          organizationId: invitation.organizationId,
          role: invitation.role,
          expiresAt: invitation.expiresAt,
          createdAt: invitation.createdAt,
        }),
        (error) => {
          throw adminCreateInvitationErrorResponse(error);
        }
      );
    }),
  });

  const publicHandler = new OpenAPIHandler(publicRouter, yoinkOpenApiHandlerOptions);
  const protectedHandler = new OpenAPIHandler(
    protectedRouter,
    openApiHandlerOptions(adminProtectedValidation)
  );

  await app.register(async (publicApp) => {
    if (rateLimitConfig.enabled) {
      await publicApp.register(rateLimit, {
        max: rateLimitConfig.adminLoginMax,
        timeWindow: rateLimitConfig.adminLoginTimeWindow,
        keyGenerator: (request) => clientIpOf(request),
      });
    }

    publicApp.route({
      method: 'POST',
      url: '/api/admin/login',
      handler: async (request, reply) => dispatchOrpc(publicHandler, request, reply),
    });
    publicApp.route({
      method: 'POST',
      url: '/api/admin/logout',
      handler: async (request, reply) => dispatchOrpc(publicHandler, request, reply),
    });
  });

  await app.register(async (protectedApp) => {
    const authMiddleware = createAdminSessionMiddleware({ adminSessionService });
    protectedApp.addHook('preHandler', authMiddleware);

    const mount = (
      method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE' | Array<'GET' | 'POST' | 'PATCH'>,
      url: string
    ) => {
      protectedApp.route({
        method,
        url,
        handler: async (request, reply) => dispatchOrpc(protectedHandler, request, reply),
      });
    };

    mount('GET', '/api/admin/session');
    mount(['GET', 'POST'], '/api/admin/organizations');
    mount('POST', '/api/admin/organizations/:id/owner-invitation');
    mount('GET', '/api/admin/organizations/:id/owner-invitation');
    mount(['GET', 'PATCH'], '/api/admin/organizations/:id');
    mount('GET', '/api/admin/organizations/:organizationId/users');
    mount('POST', '/api/admin/organizations/:organizationId/users');
    mount('PUT', '/api/admin/organizations/:id/owner');
    mount('PATCH', '/api/admin/organizations/:id/members/:userId');
    mount(['GET', 'PATCH'], '/api/admin/users/:id');
    mount('PATCH', '/api/admin/projects/:id');
    mount('GET', '/api/admin/organizations/:organizationId/tokens');
    mount('POST', '/api/admin/organizations/:organizationId/tokens');
    mount('DELETE', '/api/admin/tokens/:id');
    mount('POST', '/api/admin/organizations/:organizationId/invitations');
  });
};

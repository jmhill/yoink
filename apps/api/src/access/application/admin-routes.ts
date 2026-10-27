import type { FastifyInstance, FastifyRequest } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { initServer } from '@ts-rest/fastify';
import {
  adminPublicContract,
  adminProtectedContract,
  CREATE_OWNER_INVITE_STORAGE_MESSAGE,
  OWNER_EMAIL_REQUIRED_MESSAGE,
  THERE_HAS_TO_BE_AT_LEAST_ONE_ADMIN_MESSAGE,
} from '@yoink/api-contracts';
import type { AdminService } from '../domain/admin-service.js';
import type { AdminServiceError } from '../domain/admin-errors.js';
import type { AdminSessionService } from '../domain/admin-session-service.js';
import type { InvitationService } from '../domain/invitation-service.js';
import type { Invitation } from '../domain/invitation.js';
import type { User } from '../domain/user.js';
import { ADMIN_SESSION_COOKIE, createAdminSessionMiddleware } from './admin-session-middleware.js';
import type { RateLimitConfig, CookieConfig } from '../../config/schema.js';
import {
  namedRequestValidationError,
  validationIssuePaths,
} from '../../shared/request-validation.js';
import type { ClientIpOf } from '../../shared/request-client-ip.js';
import type { handleCreateWorkspace } from './handle-create-workspace.js';
import type { handleIssueOwnerInvitation } from './handle-issue-owner-invitation.js';
import type { handleGetOwnerInvitation } from './handle-get-owner-invitation.js';
import type { handleListWorkspaces } from './handle-list-workspaces.js';
import type { HandleListWorkspacesError } from './handle-list-workspaces.js';
import {
  adminCreateInvitationErrorResponse,
  createWorkspaceErrorResponse,
  issueOwnerInvitationErrorResponse,
  loggedCause,
  logAndReturnStorageFailure,
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

const storageErrorResponse = (
  request: FastifyRequest,
  error: unknown,
  message: string
) => logAndReturnStorageFailure(request, error, message);

const listWorkspacesErrorResponse = (
  request: FastifyRequest,
  error: HandleListWorkspacesError
) => {
  switch (error.type) {
    case 'WORKSPACE_ROW_INVALID':
    case 'LIST_WORKSPACES_FAILED': {
      request.log.error({ error: loggedCause(error) }, 'Failed to list organizations');
      return {
        status: 500 as const,
        body: { message: 'Failed to list organizations', code: error.type },
      };
    }
    default: {
      const _never: never = error;
      void _never;
      request.log.error({ error: loggedCause(error) }, 'Failed to list organizations');
      return {
        status: 500 as const,
        body: { message: 'Failed to list organizations', code: 'LIST_WORKSPACES_FAILED' },
      };
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

const setOrganizationOwnerErrorResponse = (
  request: FastifyRequest,
  error: AdminServiceError
) => {
  switch (error.type) {
    case 'ORGANIZATION_NOT_FOUND':
      return {
        status: 404 as const,
        body: { message: 'Organization not found' },
      };
    case 'USER_NOT_FOUND':
      return {
        status: 404 as const,
        body: { message: 'User not found' },
      };
    case 'TARGET_NOT_WORKSPACE_MEMBER':
      return {
        status: 400 as const,
        body: { message: error.message, code: error.type },
      };
    case 'BOT_CANNOT_HAVE_PRIVILEGED_ROLE':
      return {
        status: 400 as const,
        body: { message: error.message, code: error.type },
      };
    case 'OWNER_MUST_TRANSFER':
      return {
        status: 409 as const,
        body: { message: error.message, code: error.type },
      };
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
      return storageErrorResponse(request, error, 'Failed to set owner');
    default: {
      const _never: never = error;
      void _never;
      return storageErrorResponse(request, error, 'Failed to set owner');
    }
  }
};

const changeMemberRoleErrorResponse = (
  request: FastifyRequest,
  error: AdminServiceError
) => {
  switch (error.type) {
    case 'ORGANIZATION_NOT_FOUND':
      return {
        status: 404 as const,
        body: { message: 'Organization not found' },
      };
    case 'USER_NOT_FOUND':
    case 'TARGET_NOT_WORKSPACE_MEMBER':
    case 'MEMBERSHIP_NOT_FOUND':
      return {
        status: 404 as const,
        body: { message: 'Member not found' },
      };
    case 'BOT_CANNOT_HAVE_PRIVILEGED_ROLE':
    case 'CANNOT_ASSIGN_OWNER_ROLE':
      return {
        status: 400 as const,
        body: { message: error.message, code: error.type },
      };
    case 'OWNER_MUST_TRANSFER':
      return {
        status: 409 as const,
        body: { message: error.message, code: error.type },
      };
    case 'LAST_ADMIN':
      return {
        status: 409 as const,
        body: { message: THERE_HAS_TO_BE_AT_LEAST_ONE_ADMIN_MESSAGE, code: error.type },
      };
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
      return storageErrorResponse(request, error, 'Failed to change member role');
    default: {
      const _never: never = error;
      void _never;
      return storageErrorResponse(request, error, 'Failed to change member role');
    }
  }
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
  const s = initServer();

  // Register public admin routes with strict rate limiting
  await app.register(async (publicApp) => {
    // Apply strict rate limiting to login endpoint (brute force protection)
    // Only if rate limiting is enabled
    if (rateLimitConfig.enabled) {
      await publicApp.register(rateLimit, {
        max: rateLimitConfig.adminLoginMax,
        timeWindow: rateLimitConfig.adminLoginTimeWindow,
        keyGenerator: (request) => clientIpOf(request),
      });
    }

    const publicRouter = s.router(adminPublicContract, {
      login: async ({ body, reply }) => {
        const result = adminSessionService.login(body.password);

        if (!result.success) {
          return {
            status: 401 as const,
            body: { message: 'Invalid password' },
          };
        }

        reply.setCookie(ADMIN_SESSION_COOKIE, result.sessionToken!, {
          httpOnly: true,
          secure: cookieConfig.secure,
          sameSite: 'strict',
          path: '/',
          maxAge: 24 * 60 * 60, // 24 hours
        });

        return {
          status: 200 as const,
          body: { success: true },
        };
      },

      logout: async ({ reply }) => {
        reply.clearCookie(ADMIN_SESSION_COOKIE, {
          path: '/',
        });

        return {
          status: 200 as const,
          body: { success: true },
        };
      },
    });

    s.registerRouter(adminPublicContract, publicRouter, publicApp, {
      responseValidation: true,
      requestValidationErrorHandler: (err, _request, reply) => {
        return reply.status(400).send(namedRequestValidationError(err));
      },
    });
  });

  // Register protected admin routes (auth required via middleware)
  await app.register(async (protectedApp) => {
    const authMiddleware = createAdminSessionMiddleware({ adminSessionService });
    protectedApp.addHook('preHandler', authMiddleware);

    const protectedRouter = s.router(adminProtectedContract, {
      getSession: async () => {
        // If we get here, the session is valid (middleware passed)
        return {
          status: 200 as const,
          body: { authenticated: true },
        };
      },

      listOrganizations: async ({ request }) => {
        const result = await listWorkspaces({ type: 'ListWorkspaces' });
        return result.match(
          (workspaces) => ({
            status: 200 as const,
            body: {
              organizations: workspaces.map((workspace) => ({
                id: workspace.organization.id,
                name: workspace.organization.name,
                createdAt: workspace.organization.createdAt,
                personal: workspace.personal,
                ownerStatus: workspace.ownerStatus,
              })),
            },
          }),
          (error) => listWorkspacesErrorResponse(request, error)
        );
      },

      createOrganization: async ({ body, request }) => {
        const result = await createWorkspace({
          name: body.name,
          ownerEmail: body.ownerEmail,
        });
        return result.match(
          (created) => {
            if (created.kind === 'owner-assigned') {
              return {
                status: 201 as const,
                body: {
                  organization: created.organization,
                  owner: toOwnerUser(created.owner),
                  ownerInvitation: null,
                },
              };
            }
            return {
              status: 201 as const,
              body: {
                organization: created.organization,
                owner: null,
                ownerInvitation: toOwnerInvitationSummary(created.invitation),
              },
            };
          },
          (error) => createWorkspaceErrorResponse(request, error)
        );
      },

      issueOwnerInvitation: async ({ params, body, request }) => {
        const result = await issueOwnerInvitation({
          organizationId: params.id,
          email: body.email,
        });
        return result.match(
          (issued) => {
            if (issued.kind === 'owner-assigned') {
              return {
                status: 201 as const,
                body: {
                  owner: toOwnerUser(issued.owner),
                  ownerInvitation: null,
                },
              };
            }
            return {
              status: 201 as const,
              body: {
                owner: null,
                ownerInvitation: toOwnerInvitationSummary(issued.invitation),
              },
            };
          },
          (error) => issueOwnerInvitationErrorResponse(request, error)
        );
      },

      getOwnerInvitation: async ({ params, request }) => {
        const result = await getOwnerInvitation(params.id);
        return result.match(
          (read) => ({
            status: 200 as const,
            body: {
              ownerInvitation: read.ownerInvitation
                ? toOwnerInvitationSummary(read.ownerInvitation)
                : null,
              expiredOwnerInvitation: read.expiredOwnerInvitation,
              personal: read.personal,
            },
          }),
          (error) => {
            switch (error.type) {
              case 'ORGANIZATION_NOT_FOUND':
                return {
                  status: 404 as const,
                  body: { message: 'Organization not found', code: error.type },
                };
              case 'ISSUE_OWNER_INVITATION_FAILED':
              case 'WORKSPACE_ROW_INVALID':
                return storageErrorResponse(
                  request,
                  error,
                  CREATE_OWNER_INVITE_STORAGE_MESSAGE
                );
              default: {
                const _never: never = error;
                void _never;
                return storageErrorResponse(
                  request,
                  error,
                  CREATE_OWNER_INVITE_STORAGE_MESSAGE
                );
              }
            }
          }
        );
      },

      getOrganization: async ({ params, request }: { params: { id: string }; request: FastifyRequest }) => {
        const result = await adminService.getOrganization(params.id);
        return result.match(
          (organization) => {
            if (!organization) {
              return {
                status: 404 as const,
                body: { message: 'Organization not found' },
              };
            }
            return {
              status: 200 as const,
              body: organization,
            };
          },
          (error) => storageErrorResponse(request, error, 'Failed to get organization')
        );
      },

      updateOrganization: async ({ params, body, request }: { params: { id: string }; body: { name: string }; request: FastifyRequest }) => {
        const result = await adminService.renameOrganization(params.id, body.name);
        return result.match(
          (organization) => {
            if (!organization) {
              return {
                status: 404 as const,
                body: { message: 'Organization not found' },
              };
            }
            return {
              status: 200 as const,
              body: organization,
            };
          },
          (error) => storageErrorResponse(request, error, 'Failed to update organization')
        );
      },

      listUsers: async ({ params, request }: { params: { organizationId: string }; request: FastifyRequest }) => {
        // Check if organization exists
        const orgResult = await adminService.getOrganization(params.organizationId);
        const orgCheck = orgResult.match(
          (org) => (org ? null : { status: 404 as const, body: { message: 'Organization not found' } }),
          (error) => storageErrorResponse(request, error, 'Failed to check organization')
        );
        if (orgCheck) return orgCheck;

        const result = await adminService.listUsers(params.organizationId);
        return result.match(
          (users) => ({
            status: 200 as const,
            body: { users },
          }),
          (error) => storageErrorResponse(request, error, 'Failed to list users')
        );
      },

      createUser: async ({ params, body, request }) => {
        const result = await adminService.createUser({
          organizationId: params.organizationId,
          email: body.email,
          role: body.role,
          kind: body.kind,
          name: body.name,
        });

        return result.match(
          (user) => ({
            status: 201 as const,
            body: user,
          }),
          (error) => {
            if (error.type === 'ORGANIZATION_STORAGE_ERROR' && error.message === 'Organization not found') {
              return {
                status: 404 as const,
                body: { message: 'Organization not found' },
              };
            }
            if (error.type === 'BOT_CANNOT_HAVE_PRIVILEGED_ROLE') {
              return {
                status: 400 as const,
                body: { message: error.message, code: error.type },
              };
            }
            return storageErrorResponse(request, error, 'Failed to create user');
          }
        );
      },

      setOrganizationOwner: async ({ params, body, request }) => {
        const result = await adminService.setOrganizationOwner({
          organizationId: params.id,
          userId: body.userId,
        });

        return result.match(
          (member) => ({
            status: 200 as const,
            body: member,
          }),
          (error) => setOrganizationOwnerErrorResponse(request, error)
        );
      },

      changeMemberRole: async ({ params, body, request }) => {
        const result = await adminService.changeMemberRole({
          organizationId: params.id,
          userId: params.userId,
          role: body.role,
        });

        return result.match(
          (member) => ({
            status: 200 as const,
            body: member,
          }),
          (error) => changeMemberRoleErrorResponse(request, error)
        );
      },

      getUser: async ({ params, request }: { params: { id: string }; request: FastifyRequest }) => {
        const result = await adminService.getUser(params.id);
        return result.match(
          (user) => {
            if (!user) {
              return {
                status: 404 as const,
                body: { message: 'User not found' },
              };
            }
            return {
              status: 200 as const,
              body: user,
            };
          },
          (error) => storageErrorResponse(request, error, 'Failed to get user')
        );
      },

      updateUser: async ({ params, body, request }: { params: { id: string }; body: { name: string }; request: FastifyRequest }) => {
        const result = await adminService.updateUser(params.id, body.name);
        return result.match(
          (user) => ({
            status: 200 as const,
            body: user,
          }),
          (error) => {
            if (error.type === 'USER_NOT_FOUND') {
              return {
                status: 404 as const,
                body: { message: 'User not found' },
              };
            }
            return storageErrorResponse(request, error, 'Failed to update user');
          }
        );
      },

      updateProjectCreatedAt: async ({
        params,
        body,
        request,
      }: {
        params: { id: string };
        body: { createdAt: string };
        request: FastifyRequest;
      }) => {
        const result = await adminService.updateProjectCreatedAt(params.id, body.createdAt);
        return result.match(
          (project) => ({
            status: 200 as const,
            body: project,
          }),
          (error) => {
            if (error.type === 'PROJECT_NOT_FOUND') {
              return {
                status: 404 as const,
                body: { message: 'Project not found' },
              };
            }
            return storageErrorResponse(request, error, 'Failed to update project');
          }
        );
      },

      listTokens: async ({ params, request }: { params: { organizationId: string }; request: FastifyRequest }) => {
        // Check if organization exists
        const orgResult = await adminService.getOrganization(params.organizationId);
        const orgCheck = orgResult.match(
          (org) => (org ? null : { status: 404 as const, body: { message: 'Organization not found' } }),
          (error) => storageErrorResponse(request, error, 'Failed to check organization')
        );
        if (orgCheck) return orgCheck;

        const result = await adminService.listTokens(params.organizationId);
        return result.match(
          (tokens) => ({
            status: 200 as const,
            body: { tokens },
          }),
          (error) => storageErrorResponse(request, error, 'Failed to list tokens')
        );
      },

      createToken: async ({ params, body, request }: { params: { organizationId: string }; body: { userId: string; name: string }; request: FastifyRequest }) => {
        // Check if organization exists
        const orgResult = await adminService.getOrganization(params.organizationId);
        const orgCheck = orgResult.match(
          (org) => (org ? null : { status: 404 as const, body: { message: 'Organization not found' } }),
          (error) => storageErrorResponse(request, error, 'Failed to check organization')
        );
        if (orgCheck) return orgCheck;

        // Check if user exists
        const userResult = await adminService.getUser(body.userId);
        const userCheck = userResult.match(
          (user) => (user ? null : { status: 404 as const, body: { message: 'User not found' } }),
          (error) => storageErrorResponse(request, error, 'Failed to check user')
        );
        if (userCheck) return userCheck;

        const result = await adminService.createToken({
          organizationId: params.organizationId,
          userId: body.userId,
          name: body.name,
        });
        return result.match(
          (tokenResult) => ({
            status: 201 as const,
            body: {
              token: tokenResult.token,
              rawToken: tokenResult.rawToken,
            },
          }),
          (error) => storageErrorResponse(request, error, 'Failed to create token')
        );
      },

      revokeToken: async ({ params, request }: { params: { id: string }; request: FastifyRequest }) => {
        // We don't check if token exists - just delete it (idempotent)
        const result = await adminService.revokeToken(params.id);
        return result.match(
          () => ({
            status: 204 as const,
            body: undefined,
          }),
          (error) => storageErrorResponse(request, error, 'Failed to revoke token')
        );
      },

      createInvitation: async ({ params, body, request }: { params: { organizationId: string }; body: { role?: 'admin' | 'member'; email?: string; expiresInDays?: number }; request: FastifyRequest }) => {
        // Create invitation using the invitation service
        // Admin bypasses normal permission checks since they're the system admin
        // Note: Organization existence is validated by the invitation service
        const result = await invitationService.createInvitation({
          organizationId: params.organizationId,
          invitedByUserId: null, // Admin-created invitations have no specific user
          role: body.role ?? 'member',
          email: body.email,
          expiresInDays: body.expiresInDays,
          skipPermissionCheck: true, // Admin can create invitations without being an org member
        });

        return result.match(
          (invitation) => ({
            status: 201 as const,
            body: {
              id: invitation.id,
              code: invitation.code,
              email: invitation.email,
              organizationId: invitation.organizationId,
              role: invitation.role,
              expiresAt: invitation.expiresAt,
              createdAt: invitation.createdAt,
            },
          }),
          (error) => adminCreateInvitationErrorResponse(request, error)
        );
      },
    });

    s.registerRouter(adminProtectedContract, protectedRouter, protectedApp, {
      responseValidation: true,
      requestValidationErrorHandler: (err, _request, reply) => {
        const fields = validationIssuePaths(err);
        if (fields.includes('ownerEmail')) {
          return reply.status(400).send({
            message: OWNER_EMAIL_REQUIRED_MESSAGE,
            code: 'VALIDATION_FAILED',
          });
        }
        return reply.status(400).send(namedRequestValidationError(err));
      },
    });
  });
};

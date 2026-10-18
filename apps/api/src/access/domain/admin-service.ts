import { ResultAsync, errAsync, okAsync } from 'neverthrow';
import type { Clock, IdGenerator, PasswordHasher } from '@yoink/infrastructure';
import type { Organization } from './organization.js';
import type { OrganizationStore } from './organization-store.js';
import type { MembershipRole, OrganizationMembership } from './organization-membership.js';
import type { OrganizationMembershipStore } from './organization-membership-store.js';
import { agentEmailFor, principalKindOf, type PrincipalKind, type User } from './user.js';
import type { UserStore } from './user-store.js';
import { decideBotMayHaveRole } from './decide-bot-role.js';
import { decideChangeMemberRole } from './decide-change-member-role.js';
import { decideSetOwner } from './decide-set-owner.js';
import type { ChangeMemberRole, SetOwnerCommand } from './membership-commands.js';
import type { ApiToken } from './api-token.js';
import type { TokenStore } from './token-store.js';
import type {
  AdminServiceError,
  OrganizationStorageError,
  UserStorageError,
  TokenStorageError,
} from './admin-errors.js';
import { organizationNotFoundError, userNotFoundError } from './admin-errors.js';
import type { Project } from '@yoink/api-contracts';
import type { ProjectStore } from '../../projects/domain/project-store.js';
import { projectNotFoundError } from '../../projects/domain/project-errors.js';

export type AdminServiceDependencies = {
  organizationStore: OrganizationStore;
  organizationMembershipStore: OrganizationMembershipStore;
  userStore: UserStore;
  tokenStore: TokenStore;
  projectStore: ProjectStore;
  clock: Clock;
  idGenerator: IdGenerator;
  passwordHasher: PasswordHasher;
};

export type CreateUserCommand = {
  organizationId: string;
  email: string;
  /** Defaults to member. Owner is assigned only via setOrganizationOwner. */
  role?: 'admin' | 'member';
  kind?: PrincipalKind;
  name?: string;
};

export type SetOrganizationOwnerCommand = SetOwnerCommand;

export type AdminChangeMemberRoleInput = {
  organizationId: string;
  userId: string;
  role: 'admin' | 'member';
};

export type AdminOrganizationMember = User & {
  role: MembershipRole;
};

export type CreateTokenCommand = {
  organizationId: string;
  userId: string;
  name: string;
};

export type CreateTokenResult = {
  token: ApiTokenView; // View without hash, not full ApiToken
  rawToken: string; // The full tokenId:secret value
};

// API token without the hash (for external API responses)
export type ApiTokenView = Omit<ApiToken, 'tokenHash'>;

export type AdminService = {
  // Organizations
  listOrganizations(): ResultAsync<Organization[], OrganizationStorageError>;
  getOrganization(id: string): ResultAsync<Organization | null, OrganizationStorageError>;
  createOrganization(name: string): ResultAsync<Organization, OrganizationStorageError>;
  renameOrganization(
    id: string,
    newName: string
  ): ResultAsync<Organization | null, OrganizationStorageError>;

  // Users
  listUsers(organizationId: string): ResultAsync<AdminOrganizationMember[], AdminServiceError>;
  getUser(id: string): ResultAsync<User | null, UserStorageError>;
  createUser(command: CreateUserCommand): ResultAsync<User, AdminServiceError>;
  updateUser(id: string, name: string): ResultAsync<User, AdminServiceError>;
  setOrganizationOwner(
    command: SetOrganizationOwnerCommand
  ): ResultAsync<AdminOrganizationMember, AdminServiceError>;
  changeMemberRole(
    command: AdminChangeMemberRoleInput
  ): ResultAsync<AdminOrganizationMember, AdminServiceError>;
  updateProjectCreatedAt(
    id: string,
    createdAt: string
  ): ResultAsync<Project, AdminServiceError>;

  // Tokens (scoped to organizations)
  listTokens(organizationId: string): ResultAsync<ApiTokenView[], TokenStorageError>;
  createToken(command: CreateTokenCommand): ResultAsync<CreateTokenResult, AdminServiceError>;
  revokeToken(id: string): ResultAsync<void, TokenStorageError>;
};

const toApiTokenView = (token: ApiToken): ApiTokenView => {
  const { tokenHash: _hash, revokedAt: _revoked, ...view } = token;
  return view;
};

export const createAdminService = (
  deps: AdminServiceDependencies
): AdminService => {
  const {
    organizationStore,
    organizationMembershipStore,
    userStore,
    tokenStore,
    projectStore,
    clock,
    idGenerator,
    passwordHasher,
  } = deps;

  return {
    // Organizations
    listOrganizations() {
      return organizationStore.findAll();
    },

    getOrganization(id: string) {
      return organizationStore.findById(id);
    },

    createOrganization(name: string) {
      const organization: Organization = {
        id: idGenerator.generate(),
        name,
        createdAt: clock.now().toISOString(),
      };

      return organizationStore.save(organization).map(() => organization);
    },

    renameOrganization(id: string, newName: string) {
      return organizationStore.findById(id).andThen((org) => {
        if (!org) {
          return ResultAsync.fromSafePromise(Promise.resolve(null));
        }

        const updated: Organization = {
          ...org,
          name: newName,
        };

        return organizationStore.save(updated).map(() => updated);
      });
    },

    // Users
    listUsers(organizationId: string) {
      return organizationMembershipStore
        .findByOrganizationId(organizationId)
        .andThen((memberships) => {
          const userIds = memberships.map((m) => m.userId);
          return userStore.findByIds(userIds).map((users) => {
            const roleByUserId = new Map(memberships.map((m) => [m.userId, m.role]));
            return users.flatMap((user) => {
              const role = roleByUserId.get(user.id);
              return role === undefined ? [] : [{ ...user, role }];
            });
          });
        });
    },

    getUser(id: string) {
      return userStore.findById(id);
    },

    updateUser(id: string, name: string): ResultAsync<User, AdminServiceError> {
      return userStore.updateName(id, name).andThen(() =>
        userStore.findById(id).andThen((user) =>
          user ? okAsync(user) : errAsync(userNotFoundError(id))
        )
      );
    },

    updateProjectCreatedAt(id: string, createdAt: string): ResultAsync<Project, AdminServiceError> {
      return projectStore.updateCreatedAt(id, createdAt).andThen(() =>
        projectStore.findById(id).andThen((project) =>
          project ? okAsync(project) : errAsync(projectNotFoundError(id))
        )
      );
    },

    setOrganizationOwner(
      command: SetOrganizationOwnerCommand
    ): ResultAsync<AdminOrganizationMember, AdminServiceError> {
      const { organizationId, userId } = command;
      return organizationStore.findById(organizationId).andThen((org) => {
        if (!org) {
          return errAsync(organizationNotFoundError(organizationId));
        }
        return userStore.findById(userId).andThen((targetUser) => {
          if (!targetUser) {
            return errAsync(userNotFoundError(userId));
          }
          return organizationMembershipStore.findByOrganizationId(organizationId).andThen((members) => {
            const decision = decideSetOwner({
              command: { organizationId, userId },
              members,
              targetUser,
            });
            if (decision.isErr()) {
              return errAsync(decision.error);
            }
            return organizationMembershipStore
              .setOwner(decision.value)
              .map(() => ({ ...targetUser, role: decision.value.promote.role }));
          });
        });
      });
    },

    changeMemberRole(
      command: AdminChangeMemberRoleInput
    ): ResultAsync<AdminOrganizationMember, AdminServiceError> {
      const { organizationId, userId, role } = command;
      return organizationStore.findById(organizationId).andThen((org) => {
        if (!org) {
          return errAsync(organizationNotFoundError(organizationId));
        }
        return userStore.findById(userId).andThen((user) => {
          if (!user) {
            return errAsync(userNotFoundError(userId));
          }
          return organizationMembershipStore
            .findByOrganizationId(organizationId)
            .andThen((members) => {
              const change: ChangeMemberRole = {
                organizationId,
                userId,
                newRole: role,
                by: { kind: 'app-admin' },
              };
              const decision = decideChangeMemberRole({
                command: change,
                members,
                targetKind: principalKindOf(user),
                eventId: idGenerator.generate(),
                now: clock.now().toISOString(),
              });
              if (decision.isErr()) {
                return errAsync(decision.error);
              }
              if (decision.value.kind === 'unchanged') {
                return okAsync({ ...user, role: decision.value.membership.role });
              }
              const changed = decision.value;
              return organizationMembershipStore
                .changeMemberRole(changed.membership, changed.event)
                .map(() => ({ ...user, role: changed.membership.role }));
            });
        });
      });
    },

    createUser(command: CreateUserCommand): ResultAsync<User, AdminServiceError> {
      const { organizationId, email, role = 'member', kind, name } = command;
      const now = clock.now().toISOString();
      const userId = idGenerator.generate();
      const botCheck = decideBotMayHaveRole(kind ?? 'human', role);
      if (botCheck.isErr()) {
        return errAsync(botCheck.error);
      }

      // Check if org exists first
      return organizationStore.findById(organizationId).andThen((org) => {
        if (!org) {
          return errAsync({
            type: 'ORGANIZATION_STORAGE_ERROR' as const,
            message: 'Organization not found',
          });
        }

        const user: User = {
          id: userId,
          email: kind === 'agent' ? agentEmailFor(userId) : email,
          ...(name !== undefined ? { name } : {}),
          ...(kind !== undefined ? { kind } : {}),
          createdAt: now,
        };

        const membership: OrganizationMembership = {
          id: idGenerator.generate(),
          userId,
          organizationId,
          role,
          isPersonalOrg: false,
          joinedAt: now,
        };

        // Save user and membership
        return userStore.save(user).andThen(() =>
          organizationMembershipStore.save(membership).map(() => user)
        );
      });
    },

    // Tokens
    listTokens(organizationId: string) {
      return tokenStore.findByOrganizationId(organizationId).map((tokens) => tokens.map(toApiTokenView));
    },

    createToken(command: CreateTokenCommand): ResultAsync<CreateTokenResult, AdminServiceError> {
      const { organizationId, userId, name } = command;
      const tokenName = name.trim();

      const tokenId = idGenerator.generate();
      const secret = idGenerator.generate(); // Use UUID as secret for sufficient entropy

      // We need to hash the secret, but passwordHasher.hash returns a Promise
      // Wrap it in ResultAsync
      return ResultAsync.fromPromise(
        passwordHasher.hash(secret),
        (error) => ({
          type: 'TOKEN_STORAGE_ERROR' as const,
          message: 'Failed to hash token secret',
          cause: error,
        })
      ).andThen((tokenHash) => {
        const token: ApiToken = {
          id: tokenId,
          userId,
          organizationId,
          tokenHash,
          name: tokenName,
          createdAt: clock.now().toISOString(),
        };

        return tokenStore.save(token).map(() => ({
          token: toApiTokenView(token),
          rawToken: `${tokenId}:${secret}`,
        }));
      });
    },

    revokeToken(id: string) {
      return tokenStore.revoke(id, clock.now().toISOString());
    },
  };
};

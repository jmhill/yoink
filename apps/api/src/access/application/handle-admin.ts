import { errAsync, okAsync, ResultAsync } from 'neverthrow';
import type { Project } from '@yoink/api-contracts';
import type { Clock } from '../../kernel/clock.js';
import type { IdGenerator } from '../../kernel/id-generator.js';
import type { PasswordHasher } from '../../kernel/password-hasher.js';
import type { CommitFailure, UnitOfWork } from '../../kernel/unit-of-work.js';
import type { ProjectStore } from '../../modules/task-management/domain/ports/project-store.js';
import { projectNotFoundError } from '../../modules/task-management/domain/messages/project-errors.js';
import type { AdminPlan } from '../domain/admin-plan.js';
import type { ApiToken } from '../domain/api-token.js';
import {
  decideAdminToken,
  decideRevokeAdminToken,
  type AdminCreateTokenCommand,
} from '../domain/decide-admin-token.js';
import {
  decideCreateAdminMember,
  planCreateAdminMember,
  type AdminCreateUserCommand,
} from '../domain/decide-create-admin-member.js';
import { decideCreateOrganization } from '../domain/decide-create-organization.js';
import { decideRenameOrganization } from '../domain/decide-rename-organization.js';
import { decideRenameUser, renamedUser } from '../domain/decide-rename-user.js';
import { decideBotMayHaveRole } from '../domain/decide-bot-role.js';
import { decideChangeMemberRole } from '../domain/decide-change-member-role.js';
import { decideSetOwner } from '../domain/decide-set-owner.js';
import type { AdminServiceError } from '../domain/admin-errors.js';
import { tokenStorageError, type TokenStorageError } from '../domain/auth-errors.js';
import type { InvitationStore } from '../domain/invitation-store.js';
import type { SetOwnerCommand, ChangeMemberRole } from '../domain/membership-commands.js';
import type { MembershipRole } from '../domain/organization-membership.js';
import type { OrganizationMembershipStore } from '../domain/organization-membership-store.js';
import {
  membershipStorageError,
  organizationNotFoundError,
  organizationStorageError,
  type OrganizationStorageError,
} from '../domain/organization-errors.js';
import type { Organization } from '../domain/organization.js';
import type { OrganizationStore } from '../domain/organization-store.js';
import { principalKindOf, type User } from '../domain/user.js';
import { userNotFoundError, userStorageError, type UserStorageError } from '../domain/user-errors.js';
import type { TokenStore } from '../domain/token-store.js';
import type { UserStore } from '../domain/user-store.js';

export type AdminServiceDependencies = {
  organizationStore: OrganizationStore;
  organizationMembershipStore: OrganizationMembershipStore;
  userStore: UserStore;
  invitationStore: InvitationStore;
  tokenStore: TokenStore;
  projectStore: ProjectStore;
  clock: Clock;
  idGenerator: IdGenerator;
  passwordHasher: PasswordHasher;
  /**
   * The composition root passes the sqlite unit of work. Plans then go
   * through the access SQL participant. Tests may omit it and apply the
   * same plans through these stores.
   */
  unitOfWork?: UnitOfWork;
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

export type CreateTokenResult = {
  token: ApiTokenView;
  rawToken: string;
};

export type ApiTokenView = Omit<ApiToken, 'tokenHash'>;

export type AdminService = {
  getOrganization(id: string): ResultAsync<Organization | null, OrganizationStorageError>;
  createOrganization(name: string): ResultAsync<Organization, OrganizationStorageError>;
  renameOrganization(
    id: string,
    newName: string
  ): ResultAsync<Organization | null, OrganizationStorageError>;
  listUsers(organizationId: string): ResultAsync<AdminOrganizationMember[], AdminServiceError>;
  getUser(id: string): ResultAsync<User | null, UserStorageError>;
  createUser(command: AdminCreateUserCommand): ResultAsync<User, AdminServiceError>;
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
  listTokens(organizationId: string): ResultAsync<ApiTokenView[], TokenStorageError>;
  createToken(command: AdminCreateTokenCommand): ResultAsync<CreateTokenResult, AdminServiceError>;
  revokeToken(id: string): ResultAsync<void, TokenStorageError>;
};

const toApiTokenView = (token: ApiToken): ApiTokenView => {
  const { tokenHash: _hash, revokedAt: _revoked, ...view } = token;
  return view;
};

/**
 * Reads stay on the stores. Writes are one plan. With `unitOfWork` the
 * plan commits through the access participant. Without it the plan is
 * applied through those stores. A rename-user Conflict is user-not-found.
 * Callers of other plans do not guard, so they map every failure with `storage`.
 */
export const createAdminService = (deps: AdminServiceDependencies): AdminService => {
  const persist = <E>(
    plan: AdminPlan,
    apply: () => ResultAsync<void, E>,
    storage: (failure: CommitFailure) => E
  ): ResultAsync<void, E> => {
    if (deps.unitOfWork === undefined) {
      return apply();
    }
    return deps.unitOfWork
      .commit([
        {
          result: null,
          events: [],
          step: { owner: 'access', plan },
        },
      ])
      .map(() => undefined)
      .mapErr((failure): E => {
        if (failure.kind === 'Conflict' && plan.kind === 'rename-user') {
          return userNotFoundError(plan.userId) as E;
        }
        return storage(failure);
      });
  };

  return {
    getOrganization(id: string) {
      return deps.organizationStore.findById(id);
    },

    createOrganization(name: string) {
      const plan = decideCreateOrganization({
        name,
        id: deps.idGenerator.generate(),
        now: deps.clock.now().toISOString(),
      });
      return persist(
        plan,
        () => deps.organizationStore.save(plan.organization),
        (failure) => organizationStorageError('Failed to save organization', failure)
      ).map(() => plan.organization);
    },

    renameOrganization(id: string, newName: string) {
      return deps.organizationStore.findById(id).andThen((organization) => {
        const plan = decideRenameOrganization({ organization, name: newName });
        if (!plan) {
          return okAsync(null);
        }
        return persist(
          plan,
          () => deps.organizationStore.save(plan.organization),
          (failure) => organizationStorageError('Failed to save organization', failure)
        ).map(() => plan.organization);
      });
    },

    listUsers(organizationId: string) {
      return deps.organizationMembershipStore
        .findByOrganizationId(organizationId)
        .andThen((memberships) => {
          const userIds = memberships.map((membership) => membership.userId);
          return deps.userStore.findByIds(userIds).map((users) => {
            const roleByUserId = new Map(memberships.map((membership) => [membership.userId, membership.role]));
            return users.flatMap((user) => {
              const role = roleByUserId.get(user.id);
              return role === undefined ? [] : [{ ...user, role }];
            });
          });
        });
    },

    getUser(id: string) {
      return deps.userStore.findById(id);
    },

    updateUser(id: string, name: string) {
      return deps.userStore.findById(id).andThen((user) => {
        if (!user) {
          return errAsync(userNotFoundError(id));
        }
        const decision = decideRenameUser({ userId: id, user, name });
        if (decision.isErr()) {
          return errAsync(decision.error);
        }
        return persist(
          decision.value,
          () => deps.userStore.updateName(decision.value.userId, decision.value.name),
          (failure) => userStorageError('Failed to update user name', failure)
        ).map(() => renamedUser(user, name));
      });
    },

    updateProjectCreatedAt(id: string, createdAt: string) {
      return deps.projectStore.updateCreatedAt(id, createdAt).andThen(() =>
        deps.projectStore.findById(id).andThen((project) =>
          project ? okAsync(project) : errAsync(projectNotFoundError(id))
        )
      );
    },

    setOrganizationOwner(command) {
      const { organizationId, userId } = command;
      return deps.organizationStore.findById(organizationId).andThen((organization) => {
        if (!organization) {
          return errAsync(organizationNotFoundError(organizationId));
        }
        return deps.userStore.findById(userId).andThen((targetUser) => {
          if (!targetUser) {
            return errAsync(userNotFoundError(userId));
          }
          return deps.organizationMembershipStore
            .findByOrganizationId(organizationId)
            .andThen((members) =>
              deps.invitationStore
                .findLiveOwnerInvitation(organizationId)
                .mapErr((error) => membershipStorageError(error.message, error.cause ?? error))
                .andThen((pendingOwnerInvitation) => {
                  const decision = decideSetOwner({
                    command: { organizationId, userId },
                    members,
                    targetUser,
                    pendingOwnerInvitation,
                    eventId: deps.idGenerator.generate(),
                    now: deps.clock.now().toISOString(),
                  });
                  if (decision.isErr()) {
                    return errAsync(decision.error);
                  }
                  const plan: AdminPlan = {
                    kind: 'set-owner',
                    transfer: decision.value.plan,
                    event: decision.value.event,
                    replaced: decision.value.replaced,
                  };
                  return persist(
                    plan,
                    () =>
                      deps.organizationMembershipStore.setOwner(
                        decision.value.plan,
                        decision.value.event,
                        decision.value.replaced
                      ),
                    (failure) => membershipStorageError('Failed to set owner', failure)
                  ).map(() => ({ ...targetUser, role: decision.value.plan.promote.role }));
                })
            );
        });
      });
    },

    changeMemberRole(command) {
      const { organizationId, userId, role } = command;
      return deps.organizationStore.findById(organizationId).andThen((organization) => {
        if (!organization) {
          return errAsync(organizationNotFoundError(organizationId));
        }
        return deps.userStore.findById(userId).andThen((user) => {
          if (!user) {
            return errAsync(userNotFoundError(userId));
          }
          return deps.organizationMembershipStore
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
                eventId: deps.idGenerator.generate(),
                now: deps.clock.now().toISOString(),
              });
              if (decision.isErr()) {
                return errAsync(decision.error);
              }
              if (decision.value.kind === 'unchanged') {
                return okAsync({ ...user, role: decision.value.membership.role });
              }
              const changed = decision.value;
              const plan: AdminPlan = {
                kind: 'change-member-role',
                membership: changed.membership,
                event: changed.event,
              };
              return persist(
                plan,
                () =>
                  deps.organizationMembershipStore.changeMemberRole(
                    changed.membership,
                    changed.event
                  ),
                (failure) => membershipStorageError('Failed to change member role', failure)
              ).map(() => ({ ...user, role: changed.membership.role }));
            });
        });
      });
    },

    createUser(command) {
      const now = deps.clock.now().toISOString();
      const userId = deps.idGenerator.generate();
      const botCheck = decideBotMayHaveRole(command.kind ?? 'human', command.role ?? 'member');
      if (botCheck.isErr()) {
        return errAsync(botCheck.error);
      }
      return deps.organizationStore.findById(command.organizationId).andThen((organization) => {
        const decision = decideCreateAdminMember({
          command,
          organization,
          userId,
        });
        if (decision.isErr()) {
          return errAsync(decision.error);
        }
        const plan = planCreateAdminMember({
          decision: decision.value,
          userId,
          membershipId: deps.idGenerator.generate(),
          organizationId: command.organizationId,
          now,
        });
        return persist(
          plan,
          () =>
            deps.userStore
              .save(plan.user)
              .andThen(() => deps.organizationMembershipStore.save(plan.membership)),
          (failure) => userStorageError('Failed to save user', failure)
        ).map(() => plan.user);
      });
    },

    listTokens(organizationId: string) {
      return deps.tokenStore
        .findByOrganizationId(organizationId)
        .map((tokens) => tokens.map(toApiTokenView));
    },

    createToken(command) {
      const tokenId = deps.idGenerator.generate();
      const secret = deps.idGenerator.generate();
      return ResultAsync.fromPromise(deps.passwordHasher.hash(secret), (error) =>
        tokenStorageError('Failed to hash token secret', error)
      ).andThen((tokenHash) => {
        const plan = decideAdminToken({
          command,
          tokenId,
          tokenHash,
          now: deps.clock.now().toISOString(),
        });
        return persist(
          plan,
          () => deps.tokenStore.save(plan.token),
          (failure) => tokenStorageError('Failed to save token', failure)
        ).map(() => ({
          token: toApiTokenView(plan.token),
          rawToken: `${tokenId}:${secret}`,
        }));
      });
    },

    revokeToken(id: string) {
      const plan = decideRevokeAdminToken({
        tokenId: id,
        revokedAt: deps.clock.now().toISOString(),
      });
      return persist(
        plan,
        () => deps.tokenStore.revoke(plan.tokenId, plan.revokedAt),
        (failure) => tokenStorageError('Failed to revoke token', failure)
      );
    },
  };
};

import { errAsync, okAsync, type ResultAsync } from 'neverthrow';
import type { Clock } from '../../kernel/clock.js';
import type { IdGenerator } from '../../kernel/id-generator.js';
import type { CommitFailure, UnitOfWork } from '../../kernel/unit-of-work.js';
import {
  handleChangeMemberRole,
  type ChangeMemberRoleHandler,
} from './handle-change-member-role.js';
import { handleRemoveMember, type RemoveMemberHandler } from './handle-remove-member.js';
import {
  decideAddMember,
  decideAddMemberOrganization,
  decideAddMemberUser,
  planAddMember,
} from '../domain/decide-add-member.js';
import type { AddMemberCommand } from '../domain/membership-commands.js';
import { planRemoveMember, planSetMemberRole, type MembershipPlan } from '../domain/membership-plan.js';
import { roleAtLeast } from '../domain/membership-roles.js';
import type { OrganizationMembership, MembershipRole } from '../domain/organization-membership.js';
import type { OrganizationMembershipStore } from '../domain/organization-membership-store.js';
import {
  membershipStorageError,
  type MembershipServiceError,
  type MembershipStorageError,
} from '../domain/organization-errors.js';
import type { OrganizationStore } from '../domain/organization-store.js';
import type { UserService } from './handle-user.js';

export type { AddMemberCommand } from '../domain/membership-commands.js';

export type GetMembershipQuery = {
  userId: string;
  organizationId: string;
};

export type ListMembershipsQuery = {
  userId?: string;
  organizationId?: string;
};

export type MembershipService = {
  addMember(command: AddMemberCommand): ResultAsync<OrganizationMembership, MembershipServiceError>;

  getMembership(
    query: GetMembershipQuery
  ): ResultAsync<OrganizationMembership | null, MembershipServiceError>;

  listMemberships(
    query: ListMembershipsQuery
  ): ResultAsync<OrganizationMembership[], MembershipServiceError>;

  hasRole(options: {
    userId: string;
    organizationId: string;
    requiredRole: MembershipRole;
  }): ResultAsync<boolean, MembershipServiceError>;

  /**
   * Leave (`by.kind === 'self'`) or remove someone else. The leave guards
   * in `decideRemoveMember` run before the plan is committed.
   */
  removeMember: RemoveMemberHandler;

  /** Member/admin switch. Never assigns owner. An unchanged role does not write. */
  changeMemberRole: ChangeMemberRoleHandler;
};

export type MembershipServiceDependencies = {
  membershipStore: OrganizationMembershipStore;
  userService: UserService;
  organizationStore: OrganizationStore;
  clock: Clock;
  idGenerator: IdGenerator;
  /**
   * The composition root passes the sqlite unit of work. The plan then
   * commits through the access participant. Tests may omit it and apply
   * the same plan through the membership store.
   */
  unitOfWork?: UnitOfWork;
};

const storageMessage = (plan: MembershipPlan): string => {
  switch (plan.kind) {
    case 'add-member':
      return 'Failed to save membership';
    case 'remove-member':
      return 'Failed to remove member';
    case 'set-member-role':
      return 'Failed to change member role';
    default: {
      const _never: never = plan;
      return _never;
    }
  }
};

/**
 * The command is decided after the queries it needs. One membership plan
 * comes out and is committed. Get, list, and has-role stay reads.
 * Ownership transfer stays on `handleTransferOwnership`.
 */
export const createMembershipService = (
  deps: MembershipServiceDependencies
): MembershipService => {
  const persist = (plan: MembershipPlan): ResultAsync<void, MembershipStorageError> => {
    if (deps.unitOfWork === undefined) {
      switch (plan.kind) {
        case 'add-member':
          return deps.membershipStore.save(plan.membership);
        case 'remove-member':
          return deps.membershipStore.removeMember(plan.membershipId, plan.event);
        case 'set-member-role':
          return deps.membershipStore.changeMemberRole(plan.membership, plan.event);
        default: {
          const _never: never = plan;
          return _never;
        }
      }
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
      .mapErr((failure: CommitFailure) => membershipStorageError(storageMessage(plan), failure));
  };

  return {
    addMember(command) {
      return deps.userService.getUser(command.userId).andThen((user) => {
        const requested = decideAddMemberUser({ command, user });
        if (requested.isErr()) {
          return errAsync(requested.error);
        }
        return deps.organizationStore.findById(command.organizationId).andThen((organization) => {
          const present = decideAddMemberOrganization({ command, organization });
          if (present.isErr()) {
            return errAsync(present.error);
          }
          return deps.membershipStore
            .findByUserAndOrg(command.userId, command.organizationId)
            .andThen((existing) =>
              deps.membershipStore.findByOrganizationId(command.organizationId).andThen((members) => {
                const decision = decideAddMember({
                  command,
                  user: requested.value,
                  existing,
                  members,
                });
                if (decision.isErr()) {
                  return errAsync(decision.error);
                }
                const plan = planAddMember({
                  decision: decision.value,
                  membershipId: deps.idGenerator.generate(),
                  now: deps.clock.now().toISOString(),
                });
                return persist(plan).map(() => plan.membership);
              })
            );
        });
      });
    },

    getMembership(query) {
      return deps.membershipStore.findByUserAndOrg(query.userId, query.organizationId);
    },

    listMemberships(query) {
      if (query.userId) {
        return deps.membershipStore.findByUserId(query.userId);
      }
      if (query.organizationId) {
        return deps.membershipStore.findByOrganizationId(query.organizationId);
      }
      return okAsync([]);
    },

    hasRole(options) {
      return deps.membershipStore
        .findByUserAndOrg(options.userId, options.organizationId)
        .map((membership) => {
          if (!membership) {
            return false;
          }
          return roleAtLeast(membership.role, options.requiredRole);
        });
    },

    removeMember(request) {
      return handleRemoveMember(request, {
        loadMembers: (organizationId) => deps.membershipStore.findByOrganizationId(organizationId),
        loadUser: (userId) => deps.userService.getUser(userId),
        persistRemove: ({ membershipId, event }) => persist(planRemoveMember({ membershipId, event })),
        nextId: () => deps.idGenerator.generate(),
        now: () => deps.clock.now().toISOString(),
      });
    },

    changeMemberRole(request) {
      return handleChangeMemberRole(request, {
        loadMembers: (organizationId) => deps.membershipStore.findByOrganizationId(organizationId),
        loadUser: (userId) => deps.userService.getUser(userId),
        persistChange: ({ membership, event }) => persist(planSetMemberRole({ membership, event })),
        nextId: () => deps.idGenerator.generate(),
        now: () => deps.clock.now().toISOString(),
      });
    },
  };
};

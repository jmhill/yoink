import { okAsync, errAsync, type ResultAsync } from 'neverthrow';
import type { Clock, IdGenerator } from '@yoink/infrastructure';
import type { OrganizationMembership, MembershipRole } from './organization-membership.js';
import type { OrganizationMembershipStore } from './organization-membership-store.js';
import type { OrganizationStore } from './organization-store.js';
import type { UserService } from './user-service.js';
import type {
  AddMemberCommand,
  ChangeRoleCommand,
  RemoveMemberCommand,
} from './membership-commands.js';
import { decideAddMember } from './decide-add-member.js';
import { decideChangeRole } from './decide-change-role.js';
import { decideRemoveMember } from './decide-remove-member.js';
import { roleAtLeast } from './membership-roles.js';
import { principalKindOf } from './user.js';
import {
  organizationNotFoundError,
  type MembershipServiceError,
} from './organization-errors.js';
import { userNotFoundError } from './user-errors.js';

export type {
  AddMemberCommand,
  ChangeRoleCommand,
  RemoveMemberCommand,
} from './membership-commands.js';

export type GetMembershipQuery = {
  userId: string;
  organizationId: string;
};

export type ListMembershipsQuery = {
  userId?: string;
  organizationId?: string;
};

export type MembershipService = {
  addMember(
    command: AddMemberCommand
  ): ResultAsync<OrganizationMembership, MembershipServiceError>;

  removeMember(command: RemoveMemberCommand): ResultAsync<void, MembershipServiceError>;

  changeRole(
    command: ChangeRoleCommand
  ): ResultAsync<OrganizationMembership, MembershipServiceError>;

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
};

export type MembershipServiceDependencies = {
  membershipStore: OrganizationMembershipStore;
  userService: UserService;
  organizationStore: OrganizationStore;
  clock: Clock;
  idGenerator: IdGenerator;
};

export const createMembershipService = (
  deps: MembershipServiceDependencies
): MembershipService => {
  const { membershipStore, userService, organizationStore, clock, idGenerator } = deps;

  return {
    addMember(
      command: AddMemberCommand
    ): ResultAsync<OrganizationMembership, MembershipServiceError> {
      return userService.getUser(command.userId).andThen((user) => {
        if (!user) {
          return errAsync(userNotFoundError(command.userId));
        }

        return organizationStore.findById(command.organizationId).andThen((org) => {
          if (!org) {
            return errAsync(organizationNotFoundError(command.organizationId));
          }

          return membershipStore
            .findByUserAndOrg(command.userId, command.organizationId)
            .andThen((existing) =>
              membershipStore.findByOrganizationId(command.organizationId).andThen((members) => {
                const decision = decideAddMember({
                  command,
                  user,
                  existing,
                  members,
                  membershipId: idGenerator.generate(),
                  now: clock.now().toISOString(),
                });
                if (decision.isErr()) {
                  return errAsync(decision.error);
                }
                return membershipStore.save(decision.value).map(() => decision.value);
              })
            );
        });
      });
    },

    removeMember(command: RemoveMemberCommand): ResultAsync<void, MembershipServiceError> {
      return membershipStore.findByOrganizationId(command.organizationId).andThen((members) => {
        const decision = decideRemoveMember({ command, members });
        if (decision.isErr()) {
          return errAsync(decision.error);
        }
        return membershipStore.delete(decision.value.membership.id);
      });
    },

    changeRole(
      command: ChangeRoleCommand
    ): ResultAsync<OrganizationMembership, MembershipServiceError> {
      return membershipStore
        .findByOrganizationId(command.organizationId)
        .andThen((members) =>
          userService.getUser(command.userId).andThen((user) => {
            if (!user) {
              return errAsync(userNotFoundError(command.userId));
            }
            const decision = decideChangeRole({
              command,
              members,
              targetKind: principalKindOf(user),
            });
            if (decision.isErr()) {
              return errAsync(decision.error);
            }
            return membershipStore.save(decision.value).map(() => decision.value);
          })
        );
    },

    getMembership(
      query: GetMembershipQuery
    ): ResultAsync<OrganizationMembership | null, MembershipServiceError> {
      return membershipStore.findByUserAndOrg(query.userId, query.organizationId);
    },

    listMemberships(
      query: ListMembershipsQuery
    ): ResultAsync<OrganizationMembership[], MembershipServiceError> {
      if (query.userId) {
        return membershipStore.findByUserId(query.userId);
      }
      if (query.organizationId) {
        return membershipStore.findByOrganizationId(query.organizationId);
      }
      return okAsync([]);
    },

    hasRole(options: {
      userId: string;
      organizationId: string;
      requiredRole: MembershipRole;
    }): ResultAsync<boolean, MembershipServiceError> {
      return membershipStore
        .findByUserAndOrg(options.userId, options.organizationId)
        .map((membership) => {
          if (!membership) {
            return false;
          }
          return roleAtLeast(membership.role, options.requiredRole);
        });
    },
  };
};

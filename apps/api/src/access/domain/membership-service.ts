import { okAsync, errAsync, type ResultAsync } from 'neverthrow';
import type { Clock, IdGenerator } from '@yoink/infrastructure';
import type { OrganizationMembership, MembershipRole } from './organization-membership.js';
import type { OrganizationMembershipStore } from './organization-membership-store.js';
import type { OrganizationStore } from './organization-store.js';
import type { UserService } from './user-service.js';
import { decideBotMayHaveRole } from './decide-bot-role.js';
import { decideChangeRole } from './decide-change-role.js';
import { decideRemoveMember } from './decide-remove-member.js';
import { roleAtLeast, workspaceHasOwner } from './membership-roles.js';
import { principalKindOf } from './user.js';
import {
  alreadyMemberError,
  membershipNotFoundError,
  organizationNotFoundError,
  secondOwnerError,
  type MembershipServiceError,
} from './organization-errors.js';
import { userNotFoundError } from './user-errors.js';

// ============================================================================
// Commands (input types)
// ============================================================================

export type AddMemberCommand = {
  userId: string;
  organizationId: string;
  role: MembershipRole;
  /** True if this is the user's personal org (auto-created, cannot leave) */
  isPersonalOrg?: boolean;
};

export type RemoveMemberCommand = {
  userId: string;
  organizationId: string;
};

export type ChangeRoleCommand = {
  membershipId: string;
  newRole: MembershipRole;
};

// ============================================================================
// Queries (input types)
// ============================================================================

export type GetMembershipQuery = {
  userId: string;
  organizationId: string;
};

export type ListMembershipsQuery = {
  /** List all organizations a user belongs to */
  userId?: string;
  /** List all members of an organization */
  organizationId?: string;
};

// ============================================================================
// Service Interface
// ============================================================================

export type MembershipService = {
  /**
   * Add a user to an organization with the specified role.
   * Fails if the user is already a member.
   */
  addMember(
    command: AddMemberCommand
  ): ResultAsync<OrganizationMembership, MembershipServiceError>;

  /**
   * Remove a user from an organization.
   * Fails if this is their personal org, they are the owner, or they are
   * the last admin of an ownerless workspace.
   */
  removeMember(command: RemoveMemberCommand): ResultAsync<void, MembershipServiceError>;

  /**
   * Change a member's role in an organization.
   * Fails if assigning owner, changing the owner's role, promoting a bot,
   * or demoting the last admin of an ownerless workspace.
   */
  changeRole(
    command: ChangeRoleCommand
  ): ResultAsync<OrganizationMembership, MembershipServiceError>;

  /**
   * Get a user's membership in a specific organization.
   */
  getMembership(
    query: GetMembershipQuery
  ): ResultAsync<OrganizationMembership | null, MembershipServiceError>;

  /**
   * List memberships by user or organization.
   * At least one of userId or organizationId must be provided.
   */
  listMemberships(
    query: ListMembershipsQuery
  ): ResultAsync<OrganizationMembership[], MembershipServiceError>;

  /**
   * Check if a user has at least the required role in an organization.
   * Role hierarchy: owner > admin > member
   */
  hasRole(options: {
    userId: string;
    organizationId: string;
    requiredRole: MembershipRole;
  }): ResultAsync<boolean, MembershipServiceError>;
};

// ============================================================================
// Dependencies
// ============================================================================

export type MembershipServiceDependencies = {
  membershipStore: OrganizationMembershipStore;
  userService: UserService;
  organizationStore: OrganizationStore;
  clock: Clock;
  idGenerator: IdGenerator;
};

// ============================================================================
// Implementation
// ============================================================================

export const createMembershipService = (
  deps: MembershipServiceDependencies
): MembershipService => {
  const { membershipStore, userService, organizationStore, clock, idGenerator } = deps;

  return {
    addMember(
      command: AddMemberCommand
    ): ResultAsync<OrganizationMembership, MembershipServiceError> {
      const { userId, organizationId, role, isPersonalOrg = false } = command;

      // Verify user exists via UserService
      return userService.getUser(userId).andThen((user) => {
        if (!user) {
          return errAsync(userNotFoundError(userId));
        }

        // Verify organization exists
        return organizationStore.findById(organizationId).andThen((org) => {
          if (!org) {
            return errAsync(organizationNotFoundError(organizationId));
          }

          const botCheck = decideBotMayHaveRole(principalKindOf(user), role);
          if (botCheck.isErr()) {
            return errAsync(botCheck.error);
          }

          // Check if already a member
          return membershipStore.findByUserAndOrg(userId, organizationId).andThen((existing) => {
            if (existing) {
              return errAsync(alreadyMemberError(userId, organizationId));
            }

            return membershipStore.findByOrganizationId(organizationId).andThen((allMembers) => {
              if (role === 'owner' && workspaceHasOwner(allMembers)) {
                return errAsync(secondOwnerError(organizationId));
              }

              const membership: OrganizationMembership = {
                id: idGenerator.generate(),
                userId,
                organizationId,
                role,
                isPersonalOrg,
                joinedAt: clock.now().toISOString(),
              };

              return membershipStore.save(membership).map(() => membership);
            });
          });
        });
      });
    },

    removeMember(
      command: RemoveMemberCommand
    ): ResultAsync<void, MembershipServiceError> {
      const { userId, organizationId } = command;

      return membershipStore.findByUserAndOrg(userId, organizationId).andThen((membership) => {
        if (!membership) {
          return errAsync(membershipNotFoundError({ userId, organizationId }));
        }

        return membershipStore.findByOrganizationId(organizationId).andThen((allMembers) => {
          const decision = decideRemoveMember({ membership, allMembers });
          if (decision.isErr()) {
            return errAsync(decision.error);
          }
          return membershipStore.delete(membership.id);
        });
      });
    },

    changeRole(
      command: ChangeRoleCommand
    ): ResultAsync<OrganizationMembership, MembershipServiceError> {
      const { membershipId, newRole } = command;

      return membershipStore.findById(membershipId).andThen((membership) => {
        if (!membership) {
          return errAsync(membershipNotFoundError({ membershipId }));
        }

        return userService.getUser(membership.userId).andThen((user) => {
          if (!user) {
            return errAsync(userNotFoundError(membership.userId));
          }

          return membershipStore.findByOrganizationId(membership.organizationId).andThen((allMembers) => {
            const decision = decideChangeRole({
              membership,
              newRole,
              targetKind: principalKindOf(user),
              allMembers,
            });
            if (decision.isErr()) {
              return errAsync(decision.error);
            }
            const updated = decision.value;
            return membershipStore.save(updated).map(() => updated);
          });
        });
      });
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
      // If neither is provided, return empty array
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

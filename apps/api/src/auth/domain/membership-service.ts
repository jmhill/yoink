import { okAsync, errAsync, type ResultAsync } from 'neverthrow';
import type { Clock, IdGenerator } from '@yoink/infrastructure';
import type { OrganizationMembership, MembershipRole } from './organization-membership.js';
import type { OrganizationMembershipStore } from './organization-membership-store.js';
import type { UserStore } from './user-store.js';
import type { OrganizationStore } from './organization-store.js';
import {
  alreadyMemberError,
  membershipNotFoundError,
  cannotLeavePersonalOrgError,
  cannotChangeOwnerRoleError,
  lastAdminError,
  userNotFoundError,
  organizationNotFoundError,
  type MembershipServiceError,
} from './auth-errors.js';

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
   * Fails if this is their personal org or if they're the last admin.
   */
  removeMember(command: RemoveMemberCommand): ResultAsync<void, MembershipServiceError>;

  /**
   * Change a member's role in an organization.
   * Fails if trying to change owner role or demote the last admin.
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
  userStore: UserStore;
  organizationStore: OrganizationStore;
  clock: Clock;
  idGenerator: IdGenerator;
};

// ============================================================================
// Implementation
// ============================================================================

/**
 * Role hierarchy: owner > admin > member
 * Returns true if actualRole >= requiredRole
 */
const ROLE_HIERARCHY: Record<MembershipRole, number> = {
  owner: 3,
  admin: 2,
  member: 1,
};

const roleAtLeast = (actualRole: MembershipRole, requiredRole: MembershipRole): boolean => {
  return ROLE_HIERARCHY[actualRole] >= ROLE_HIERARCHY[requiredRole];
};

/**
 * Check if a role can manage the organization (owner or admin)
 */
const isAdminRole = (role: MembershipRole): boolean => {
  return role === 'owner' || role === 'admin';
};

export const createMembershipService = (
  deps: MembershipServiceDependencies
): MembershipService => {
  const { membershipStore, userStore, organizationStore, clock, idGenerator } = deps;

  /**
   * Count how many admins (owner or admin role) exist in an organization
   */
  const countAdmins = (memberships: OrganizationMembership[]): number => {
    return memberships.filter((m) => isAdminRole(m.role)).length;
  };

  return {
    addMember(
      command: AddMemberCommand
    ): ResultAsync<OrganizationMembership, MembershipServiceError> {
      const { userId, organizationId, role, isPersonalOrg = false } = command;

      // Verify user exists
      return userStore.findById(userId).andThen((user) => {
        if (!user) {
          return errAsync(userNotFoundError(userId));
        }

        // Verify organization exists
        return organizationStore.findById(organizationId).andThen((org) => {
          if (!org) {
            return errAsync(organizationNotFoundError(organizationId));
          }

          // Check if already a member
          return membershipStore.findByUserAndOrg(userId, organizationId).andThen((existing) => {
            if (existing) {
              return errAsync(alreadyMemberError(userId, organizationId));
            }

            // Create membership
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
    },

    removeMember(
      command: RemoveMemberCommand
    ): ResultAsync<void, MembershipServiceError> {
      const { userId, organizationId } = command;

      // Find the membership
      return membershipStore.findByUserAndOrg(userId, organizationId).andThen((membership) => {
        if (!membership) {
          return errAsync(membershipNotFoundError({ userId, organizationId }));
        }

        // Cannot leave personal org
        if (membership.isPersonalOrg) {
          return errAsync(cannotLeavePersonalOrgError(userId, organizationId));
        }

        // Check if this is the last admin
        if (isAdminRole(membership.role)) {
          return membershipStore.findByOrganizationId(organizationId).andThen((allMembers) => {
            const adminCount = countAdmins(allMembers);
            if (adminCount <= 1) {
              return errAsync(lastAdminError(organizationId));
            }
            return membershipStore.delete(membership.id);
          });
        }

        return membershipStore.delete(membership.id);
      });
    },

    changeRole(
      command: ChangeRoleCommand
    ): ResultAsync<OrganizationMembership, MembershipServiceError> {
      const { membershipId, newRole } = command;

      // Find membership by ID
      return membershipStore.findById(membershipId).andThen((membership) => {
        if (!membership) {
          return errAsync(membershipNotFoundError({ membershipId }));
        }

        // Cannot change owner role
        if (membership.role === 'owner') {
          return errAsync(cannotChangeOwnerRoleError(membershipId));
        }

        // If demoting from admin, check that another admin exists
        if (isAdminRole(membership.role) && !isAdminRole(newRole)) {
          return membershipStore.findByOrganizationId(membership.organizationId).andThen((allMembers) => {
            const adminCount = countAdmins(allMembers);
            if (adminCount <= 1) {
              return errAsync(lastAdminError(membership.organizationId));
            }

            // Update the role
            const updated: OrganizationMembership = {
              ...membership,
              role: newRole,
            };
            return membershipStore.save(updated).map(() => updated);
          });
        }

        // Update the role (promoting or same level change)
        const updated: OrganizationMembership = {
          ...membership,
          role: newRole,
        };
        return membershipStore.save(updated).map(() => updated);
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

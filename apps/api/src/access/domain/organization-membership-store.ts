import type { ResultAsync } from 'neverthrow';
import type { OrganizationMembership } from './organization-membership.js';
import type { MembershipStorageError } from './organization-errors.js';
import type { OwnershipTransferred } from './owner-presence.js';

/**
 * Store interface for organization membership persistence.
 */
export type OrganizationMembershipStore = {
  /** Save a membership (create or update) */
  save(membership: OrganizationMembership): ResultAsync<void, MembershipStorageError>;

  /** Find a membership by its ID */
  findById(id: string): ResultAsync<OrganizationMembership | null, MembershipStorageError>;

  /** Find a specific membership by user and organization */
  findByUserAndOrg(
    userId: string,
    organizationId: string
  ): ResultAsync<OrganizationMembership | null, MembershipStorageError>;

  /** Find all memberships for a user (list orgs they belong to) */
  findByUserId(userId: string): ResultAsync<OrganizationMembership[], MembershipStorageError>;

  /** Find all memberships for an organization (list members) */
  findByOrganizationId(organizationId: string): ResultAsync<OrganizationMembership[], MembershipStorageError>;

  /** Delete a membership */
  delete(id: string): ResultAsync<void, MembershipStorageError>;

  /**
   * Atomically demote the old owner (if any) then promote the new owner.
   * Demote must run first so the one-owner unique index never sees two owners.
   */
  setOwner(plan: OwnershipTransferred): ResultAsync<void, MembershipStorageError>;
};

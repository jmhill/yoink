import type { ResultAsync } from 'neverthrow';
import type { OrganizationMembership } from './organization-membership.js';
import type { MembershipStorageError } from './auth-errors.js';

/**
 * Store interface for organization membership persistence.
 */
export type OrganizationMembershipStore = {
  /** Save a membership (create or update) */
  save(membership: OrganizationMembership): ResultAsync<void, MembershipStorageError>;

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
};

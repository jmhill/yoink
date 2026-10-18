import type { ResultAsync } from 'neverthrow';
import type { OrganizationMembership } from './organization-membership.js';
import type { MembershipStorageError } from './organization-errors.js';
import type { OwnershipTransferPlan } from './owner-presence.js';
import type { Invitation } from './invitation.js';
import type { AcceptMembershipChange } from './decide-accept-invitation.js';
import type { AssignOwnerPlan } from './assign-owner-plan.js';
import type {
  MemberLeft,
  MemberRemoved,
  MemberRoleChanged,
  OwnerAssigned,
  OwnershipTransferred,
} from './membership-events.js';

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
   * Atomically demote the old owner (if any) then promote the new owner,
   * record OwnerAssigned, and mark a pending owner invite replaced.
   * Demote must run first so the one-owner unique index never sees two owners.
   */
  setOwner(
    plan: OwnershipTransferPlan,
    event: OwnerAssigned,
    replaced: Invitation | null
  ): ResultAsync<void, MembershipStorageError>;

  /** Add or promote the owner from an owner invite, plus event and replaced mark. */
  assignOwnerFromInvite(
    plan: AssignOwnerPlan,
    event: OwnerAssigned,
    replaced: Invitation | null
  ): ResultAsync<void, MembershipStorageError>;

  /** Mark the invite accepted, add or promote membership, and insert the event. */
  acceptInvitation(
    accepted: Invitation,
    membershipChange: AcceptMembershipChange,
    event: OwnerAssigned | null
  ): ResultAsync<void, MembershipStorageError>;

  /**
   * Atomically demote, promote, and record the OwnershipTransferred event.
   */
  transferOwnership(
    plan: OwnershipTransferPlan,
    event: OwnershipTransferred
  ): ResultAsync<void, MembershipStorageError>;

  /** Role update plus MemberRoleChanged in one write. */
  changeMemberRole(
    membership: OrganizationMembership,
    event: MemberRoleChanged
  ): ResultAsync<void, MembershipStorageError>;

  /** Delete plus MemberRemoved or MemberLeft in one write. */
  removeMember(
    membershipId: string,
    event: MemberRemoved | MemberLeft
  ): ResultAsync<void, MembershipStorageError>;
};

import { okAsync, errAsync, type ResultAsync } from 'neverthrow';
import type { OrganizationMembership } from '../domain/organization-membership.js';
import type { OrganizationMembershipStore } from '../domain/organization-membership-store.js';
import type { MembershipEvent, OwnerAssigned } from '../domain/membership-events.js';
import type { OwnershipTransferPlan } from '../domain/owner-presence.js';
import type { Invitation } from '../domain/invitation.js';
import type { AcceptMembershipChange } from '../domain/decide-accept-invitation.js';
import type { AssignOwnerPlan } from '../domain/assign-owner-plan.js';
import { membershipStorageError, type MembershipStorageError } from '../domain/organization-errors.js';

export type FakeOrganizationMembershipStoreOptions = {
  shouldFailOnSave?: boolean;
  shouldFailOnFind?: boolean;
  shouldFailOnDelete?: boolean;
  shouldFailOnSetOwner?: boolean;
  shouldFailOnTransferOwnership?: boolean;
  shouldFailOnChangeMemberRole?: boolean;
  shouldFailOnRemoveMember?: boolean;
  shouldFailOnAssignOwnerFromInvite?: boolean;
  shouldFailOnAcceptInvitation?: boolean;
  initialMemberships?: OrganizationMembership[];
};

export type FakeOrganizationMembershipStore = OrganizationMembershipStore & {
  recordedEvents(): readonly MembershipEvent[];
  replacedInvitations(): readonly Invitation[];
  acceptedInvitations(): readonly Invitation[];
};

export const createFakeOrganizationMembershipStore = (
  options: FakeOrganizationMembershipStoreOptions = {}
): FakeOrganizationMembershipStore => {
  const memberships: OrganizationMembership[] = [...(options.initialMemberships ?? [])];
  const events: MembershipEvent[] = [];
  const replaced: Invitation[] = [];
  const accepted: Invitation[] = [];

  const saveMembership = (membership: OrganizationMembership): void => {
    const existingIndex = memberships.findIndex((entry) => entry.id === membership.id);
    if (existingIndex >= 0) {
      memberships[existingIndex] = membership;
    } else {
      memberships.push(membership);
    }
  };

  return {
    save: (membership: OrganizationMembership): ResultAsync<void, MembershipStorageError> => {
      if (options.shouldFailOnSave) {
        return errAsync(membershipStorageError('Save failed'));
      }
      saveMembership(membership);
      return okAsync(undefined);
    },

    findById: (id: string): ResultAsync<OrganizationMembership | null, MembershipStorageError> => {
      if (options.shouldFailOnFind) {
        return errAsync(membershipStorageError('Find failed'));
      }
      const found = memberships.find((m) => m.id === id);
      return okAsync(found ?? null);
    },

    findByUserAndOrg: (
      userId: string,
      organizationId: string
    ): ResultAsync<OrganizationMembership | null, MembershipStorageError> => {
      if (options.shouldFailOnFind) {
        return errAsync(membershipStorageError('Find failed'));
      }
      const found = memberships.find(
        (m) => m.userId === userId && m.organizationId === organizationId
      );
      return okAsync(found ?? null);
    },

    findByUserId: (userId: string): ResultAsync<OrganizationMembership[], MembershipStorageError> => {
      if (options.shouldFailOnFind) {
        return errAsync(membershipStorageError('Find failed'));
      }
      const found = memberships.filter((m) => m.userId === userId);
      return okAsync(found);
    },

    findByOrganizationId: (
      organizationId: string
    ): ResultAsync<OrganizationMembership[], MembershipStorageError> => {
      if (options.shouldFailOnFind) {
        return errAsync(membershipStorageError('Find failed'));
      }
      const found = memberships.filter((m) => m.organizationId === organizationId);
      return okAsync(found);
    },

    delete: (id: string): ResultAsync<void, MembershipStorageError> => {
      if (options.shouldFailOnDelete) {
        return errAsync(membershipStorageError('Delete failed'));
      }
      const index = memberships.findIndex((m) => m.id === id);
      if (index >= 0) {
        memberships.splice(index, 1);
      }
      return okAsync(undefined);
    },

    setOwner: (
      plan: OwnershipTransferPlan,
      event: OwnerAssigned,
      replacedInvitation: Invitation | null
    ): ResultAsync<void, MembershipStorageError> => {
      if (options.shouldFailOnSetOwner || options.shouldFailOnSave) {
        return errAsync(membershipStorageError('Set owner failed'));
      }
      applyPlan(memberships, plan);
      events.push(event);
      if (replacedInvitation) {
        replaced.push(replacedInvitation);
      }
      return okAsync(undefined);
    },

    transferOwnership: (plan, event): ResultAsync<void, MembershipStorageError> => {
      if (options.shouldFailOnTransferOwnership || options.shouldFailOnSave) {
        return errAsync(membershipStorageError('Transfer ownership failed'));
      }
      applyPlan(memberships, plan);
      events.push(event);
      return okAsync(undefined);
    },

    changeMemberRole: (membership, event): ResultAsync<void, MembershipStorageError> => {
      if (options.shouldFailOnChangeMemberRole) {
        return errAsync(membershipStorageError('Change member role failed'));
      }
      const next = memberships.map((entry) =>
        entry.id === membership.id ? membership : entry
      );
      memberships.splice(0, memberships.length, ...next);
      events.push(event);
      return okAsync(undefined);
    },

    removeMember: (membershipId, event): ResultAsync<void, MembershipStorageError> => {
      if (options.shouldFailOnRemoveMember) {
        return errAsync(membershipStorageError('Remove member failed'));
      }
      const next = memberships.filter((entry) => entry.id !== membershipId);
      memberships.splice(0, memberships.length, ...next);
      events.push(event);
      return okAsync(undefined);
    },

    assignOwnerFromInvite: (
      plan: AssignOwnerPlan,
      event: OwnerAssigned,
      replacedInvitation: Invitation | null
    ): ResultAsync<void, MembershipStorageError> => {
      if (options.shouldFailOnAssignOwnerFromInvite || options.shouldFailOnSave) {
        return errAsync(membershipStorageError('Assign owner from invite failed'));
      }
      if (plan.kind === 'add') {
        saveMembership(plan.membership);
      } else {
        applyPlan(memberships, plan.plan);
      }
      events.push(event);
      if (replacedInvitation) {
        replaced.push(replacedInvitation);
      }
      return okAsync(undefined);
    },

    acceptInvitation: (
      acceptedInvitation: Invitation,
      membershipChange: AcceptMembershipChange,
      event: OwnerAssigned | null
    ): ResultAsync<void, MembershipStorageError> => {
      if (options.shouldFailOnAcceptInvitation || options.shouldFailOnSave) {
        return errAsync(membershipStorageError('Accept invitation failed'));
      }
      accepted.push(acceptedInvitation);
      saveMembership(membershipChange.membership);
      if (event) {
        events.push(event);
      }
      return okAsync(undefined);
    },

    recordedEvents: () => events,
    replacedInvitations: () => replaced,
    acceptedInvitations: () => accepted,
  };
};

const applyPlan = (
  memberships: OrganizationMembership[],
  plan: OwnershipTransferPlan
): void => {
  const next = memberships.map((membership) => {
    if (plan.demote && membership.id === plan.demote.id) {
      return plan.demote;
    }
    if (membership.id === plan.promote.id) {
      return plan.promote;
    }
    return membership;
  });
  memberships.splice(0, memberships.length, ...next);
};

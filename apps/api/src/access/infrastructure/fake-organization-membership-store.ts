import { okAsync, errAsync, type ResultAsync } from 'neverthrow';
import type { OrganizationMembership } from '../domain/organization-membership.js';
import type { OrganizationMembershipStore } from '../domain/organization-membership-store.js';
import type { OwnershipTransferred } from '../domain/membership-events.js';
import type { OwnershipTransferPlan } from '../domain/owner-presence.js';
import { membershipStorageError, type MembershipStorageError } from '../domain/organization-errors.js';

export type FakeOrganizationMembershipStoreOptions = {
  shouldFailOnSave?: boolean;
  shouldFailOnFind?: boolean;
  shouldFailOnDelete?: boolean;
  shouldFailOnSetOwner?: boolean;
  shouldFailOnTransferOwnership?: boolean;
  initialMemberships?: OrganizationMembership[];
};

export type FakeOrganizationMembershipStore = OrganizationMembershipStore & {
  recordedEvents(): readonly OwnershipTransferred[];
};

export const createFakeOrganizationMembershipStore = (
  options: FakeOrganizationMembershipStoreOptions = {}
): FakeOrganizationMembershipStore => {
  const memberships: OrganizationMembership[] = [...(options.initialMemberships ?? [])];
  const events: OwnershipTransferred[] = [];

  return {
    save: (membership: OrganizationMembership): ResultAsync<void, MembershipStorageError> => {
      if (options.shouldFailOnSave) {
        return errAsync(membershipStorageError('Save failed'));
      }
      const existingIndex = memberships.findIndex((m) => m.id === membership.id);
      if (existingIndex >= 0) {
        memberships[existingIndex] = membership;
      } else {
        memberships.push(membership);
      }
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

    setOwner: ({ demote, promote }): ResultAsync<void, MembershipStorageError> => {
      if (options.shouldFailOnSetOwner || options.shouldFailOnSave) {
        return errAsync(membershipStorageError('Set owner failed'));
      }
      applyPlan(memberships, { demote, promote });
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

    recordedEvents: () => events,
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

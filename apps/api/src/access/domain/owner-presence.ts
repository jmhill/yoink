import { err, ok, type Result } from 'neverthrow';
import type { MembershipRole, OrganizationMembership } from './organization-membership.js';
import {
  ownerMustTransferError,
  type OwnerMustTransferError,
} from './organization-errors.js';

/**
 * Result of a successful owner assignment. Demote (if any) must be persisted
 * before promote so the one-owner unique index never sees two owners.
 * #190 TransferOwnershipCommand returns this same type.
 */
export type OwnershipTransferred = {
  demote: OrganizationMembership | null;
  promote: OrganizationMembership;
};

export const ownerOf = (
  members: readonly OrganizationMembership[]
): OrganizationMembership | null =>
  members.find((membership) => membership.role === 'owner') ?? null;

export const membershipsWithout = (
  members: readonly OrganizationMembership[],
  userId: string
): readonly OrganizationMembership[] =>
  members.filter((membership) => membership.userId !== userId);

export const membershipsWithRole = (
  members: readonly OrganizationMembership[],
  userId: string,
  role: MembershipRole
): readonly OrganizationMembership[] =>
  members.map((membership) =>
    membership.userId === userId ? { ...membership, role } : membership
  );

/**
 * Once a workspace has an owner, every command must leave it with an owner.
 * Remove, demote, and delete go through this. Transfer / set-owner pass
 * because they name the next owner in the same next-state.
 */
export const decideOwnerRemains = (
  current: readonly OrganizationMembership[],
  next: readonly OrganizationMembership[]
): Result<void, OwnerMustTransferError> => {
  const currentOwner = ownerOf(current);
  if (!currentOwner) {
    return ok(undefined);
  }
  if (ownerOf(next)) {
    return ok(undefined);
  }
  return err(ownerMustTransferError(currentOwner.organizationId, currentOwner.userId));
};

/** Atomic demote-then-promote plan. Does not validate the incoming owner. */
export const planOwnershipTransfer = (
  members: readonly OrganizationMembership[],
  incomingOwner: OrganizationMembership
): OwnershipTransferred => {
  if (incomingOwner.role === 'owner') {
    return {
      demote: null,
      promote: incomingOwner,
    };
  }
  const currentOwner = ownerOf(members);
  return {
    demote: currentOwner === null ? null : { ...currentOwner, role: 'admin' },
    promote: { ...incomingOwner, role: 'owner' },
  };
};

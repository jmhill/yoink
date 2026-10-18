import type { OrganizationMembership } from './organization-membership.js';
import { planOwnershipTransfer, type OwnershipTransferPlan } from './owner-presence.js';

export type AssignOwnerPlan =
  | { kind: 'add'; membership: OrganizationMembership }
  | { kind: 'promote'; plan: OwnershipTransferPlan };

export const assignOwnerByAdding = (
  membership: OrganizationMembership
): AssignOwnerPlan => ({
  kind: 'add',
  membership,
});

export const assignOwnerByPromoting = (
  members: readonly OrganizationMembership[],
  incomingOwner: OrganizationMembership
): AssignOwnerPlan => ({
  kind: 'promote',
  plan: planOwnershipTransfer(members, incomingOwner),
});

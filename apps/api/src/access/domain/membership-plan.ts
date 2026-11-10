import type { MemberLeft, MemberRemoved, MemberRoleChanged } from './membership-events.js';
import type { OrganizationMembership } from './organization-membership.js';

/**
 * One membership write. The access participant compiles it. The unit of
 * work does not inspect it. `kind` keeps these plans distinct from signup,
 * admin, mint-agent, and invitation. `set-member-role` is not admin's
 * `change-member-role`. Leave and remove share one delete. Ownership
 * transfer is not one of these plans.
 */
export type AddMemberPlan = {
  readonly kind: 'add-member';
  readonly membership: OrganizationMembership;
};

export type RemoveMemberWrite = {
  readonly kind: 'remove-member';
  readonly membershipId: string;
  readonly event: MemberRemoved | MemberLeft;
};

export type SetMemberRolePlan = {
  readonly kind: 'set-member-role';
  readonly membership: OrganizationMembership;
  readonly event: MemberRoleChanged;
};

export type MembershipPlan = AddMemberPlan | RemoveMemberWrite | SetMemberRolePlan;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const hasString = (value: unknown, key: string): boolean =>
  isRecord(value) && typeof value[key] === 'string';

export const isMembershipPlan = (plan: unknown): plan is MembershipPlan => {
  if (!isRecord(plan)) {
    return false;
  }
  if (plan.kind === 'add-member') {
    return hasString(plan.membership, 'id') && hasString(plan.membership, 'userId');
  }
  if (plan.kind === 'remove-member') {
    return typeof plan.membershipId === 'string' && hasString(plan.event, 'id');
  }
  if (plan.kind === 'set-member-role') {
    return hasString(plan.membership, 'id') && hasString(plan.event, 'id');
  }
  return false;
};

export const planRemoveMember = (input: {
  readonly membershipId: string;
  readonly event: MemberRemoved | MemberLeft;
}): RemoveMemberWrite => ({
  kind: 'remove-member',
  membershipId: input.membershipId,
  event: input.event,
});

export const planSetMemberRole = (input: {
  readonly membership: OrganizationMembership;
  readonly event: MemberRoleChanged;
}): SetMemberRolePlan => ({
  kind: 'set-member-role',
  membership: input.membership,
  event: input.event,
});

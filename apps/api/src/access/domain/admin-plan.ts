import type { ApiToken } from './api-token.js';
import type { Invitation } from './invitation.js';
import type { MemberRoleChanged, OwnerAssigned } from './membership-events.js';
import type { OrganizationMembership } from './organization-membership.js';
import type { Organization } from './organization.js';
import type { OwnershipTransferPlan } from './owner-presence.js';
import type { User } from './user.js';

/**
 * One admin write. The access participant compiles it. The unit of work
 * does not inspect it. `kind` keeps these plans distinct from signup.
 */
export type CreateOrganizationPlan = {
  readonly kind: 'create-organization';
  readonly organization: Organization;
};

export type RenameOrganizationPlan = {
  readonly kind: 'rename-organization';
  readonly organization: Organization;
};

export type CreateMemberPlan = {
  readonly kind: 'create-member';
  readonly user: User;
  readonly membership: OrganizationMembership;
};

/**
 * The name update is the guard. `rowsAffected === 0` is Conflict, which the
 * handler maps to user not found. There is no later statement.
 */
export type RenameUserPlan = {
  readonly kind: 'rename-user';
  readonly userId: string;
  readonly name: string;
};

export type SetOwnerPlan = {
  readonly kind: 'set-owner';
  readonly transfer: OwnershipTransferPlan;
  readonly event: OwnerAssigned;
  readonly replaced: Invitation | null;
};

export type ChangeMemberRolePlan = {
  readonly kind: 'change-member-role';
  readonly membership: OrganizationMembership;
  readonly event: MemberRoleChanged;
};

export type CreateAdminTokenPlan = {
  readonly kind: 'create-admin-token';
  readonly token: ApiToken;
};

export type RevokeAdminTokenPlan = {
  readonly kind: 'revoke-admin-token';
  readonly tokenId: string;
  readonly revokedAt: string;
};

export type AdminPlan =
  | CreateOrganizationPlan
  | RenameOrganizationPlan
  | CreateMemberPlan
  | RenameUserPlan
  | SetOwnerPlan
  | ChangeMemberRolePlan
  | CreateAdminTokenPlan
  | RevokeAdminTokenPlan;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const hasString = (value: unknown, key: string): boolean =>
  isRecord(value) && typeof value[key] === 'string';

export const isAdminPlan = (plan: unknown): plan is AdminPlan => {
  if (!isRecord(plan) || typeof plan.kind !== 'string') {
    return false;
  }
  switch (plan.kind) {
    case 'create-organization':
    case 'rename-organization':
      return hasString(plan.organization, 'id') && hasString(plan.organization, 'createdAt');
    case 'create-member':
      return hasString(plan.user, 'id') && hasString(plan.membership, 'id');
    case 'rename-user':
      return typeof plan.userId === 'string' && typeof plan.name === 'string';
    case 'set-owner':
      return (
        isRecord(plan.transfer) &&
        hasString(plan.transfer.promote, 'id') &&
        hasString(plan.event, 'id') &&
        (plan.replaced === null || hasString(plan.replaced, 'id'))
      );
    case 'change-member-role':
      return hasString(plan.membership, 'id') && hasString(plan.event, 'id');
    case 'create-admin-token':
      return hasString(plan.token, 'id') && hasString(plan.token, 'tokenHash');
    case 'revoke-admin-token':
      return typeof plan.tokenId === 'string' && typeof plan.revokedAt === 'string';
    default:
      return false;
  }
};

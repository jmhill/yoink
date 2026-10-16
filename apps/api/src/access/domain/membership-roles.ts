import type { MembershipRole, OrganizationMembership } from './organization-membership.js';
import { ownerOf } from './owner-presence.js';

/**
 * Role hierarchy: owner > admin > member.
 * Returns true if actualRole >= requiredRole.
 */
export const ROLE_HIERARCHY: Record<MembershipRole, number> = {
  owner: 3,
  admin: 2,
  member: 1,
};

export const roleAtLeast = (
  actualRole: MembershipRole,
  requiredRole: MembershipRole
): boolean => ROLE_HIERARCHY[actualRole] >= ROLE_HIERARCHY[requiredRole];

/** Owner and admin can manage people and bots. */
export const isAdminRole = (role: MembershipRole): boolean =>
  role === 'owner' || role === 'admin';

export const countAdmins = (memberships: readonly OrganizationMembership[]): number =>
  memberships.filter((membership) => isAdminRole(membership.role)).length;

export const workspaceHasOwner = (
  memberships: readonly OrganizationMembership[]
): boolean => ownerOf(memberships) !== null;

/**
 * Last-admin guard for ownerless workspaces: do not let the last
 * owner-or-admin leave or be demoted. When an owner is present they can
 * never leave, so an admin may leave or be demoted.
 */
export const lastAdminBlocksChange = (
  membership: OrganizationMembership,
  allMembers: readonly OrganizationMembership[]
): boolean => {
  if (!isAdminRole(membership.role) || ownerOf([membership])) {
    return false;
  }
  if (workspaceHasOwner(allMembers)) {
    return false;
  }
  return countAdmins(allMembers) <= 1;
};

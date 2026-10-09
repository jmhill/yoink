import type { Actor } from './actor.js';
import type { MembershipRole } from './organization-membership.js';
import type { PrincipalKind } from './user.js';

export const isOrgAdminRole = (role: MembershipRole | null): boolean =>
  role === 'owner' || role === 'admin';

/**
 * Org owners and admins may manage every token that belongs to an agent
 * member of their org, plus their own. Everyone else may manage only
 * their own tokens. Callers still enforce the human-session-only rule.
 */
export const canManageOrgToken = ({
  actorUserId,
  actorRole,
  tokenUserId,
  tokenOwnerKind,
}: {
  actorUserId: string;
  actorRole: MembershipRole | null;
  tokenUserId: string;
  tokenOwnerKind: PrincipalKind;
}): boolean => {
  if (tokenUserId === actorUserId) {
    return true;
  }

  return isOrgAdminRole(actorRole) && tokenOwnerKind === 'agent';
};

export const tokenIsVisibleTo = ({
  actor,
  actorRole,
  tokenUserId,
  tokenOwnerKind,
}: {
  actor: Actor;
  actorRole: MembershipRole | null;
  tokenUserId: string;
  tokenOwnerKind: PrincipalKind;
}): boolean => {
  if (actor.kind === 'bot') {
    return tokenUserId === actor.userId;
  }

  return canManageOrgToken({
    actorUserId: actor.userId,
    actorRole,
    tokenUserId,
    tokenOwnerKind,
  });
};

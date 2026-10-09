import type { MembershipRole } from './organization-membership.js';
import type { PrincipalKind } from './user.js';

/**
 * Org owners and admins may mint a token for an agent member of their org,
 * plus create their own. Everyone else may manage only their own tokens.
 * Revoke is own-token only. Callers still enforce the human-session-only rule.
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

  return (actorRole === 'owner' || actorRole === 'admin') && tokenOwnerKind === 'agent';
};

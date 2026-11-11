import type { MembershipRole } from './organization-membership.js';
import type { PrincipalKind } from './user.js';

/**
 * Member document. Access owns this shape. Edges map it onto the contract member.
 * Field order matches the contract schema.
 */
export type Member = {
  userId: string;
  email: string;
  name?: string;
  kind: PrincipalKind;
  role: MembershipRole;
  joinedAt: string;
};

/** Same display-name rule as the members list: given name, else email. */
export const memberDisplayName = (member: { name?: string; email: string }): string =>
  member.name ?? member.email;

export const toMember = (
  user: { id: string; email: string; name?: string; kind?: PrincipalKind },
  membership: { role: MembershipRole; joinedAt: string }
): Member => ({
  userId: user.id,
  email: user.email,
  name: user.name,
  kind: user.kind ?? 'human',
  role: membership.role,
  joinedAt: membership.joinedAt,
});

/** A listed membership whose user row is missing stays a human named unknown. */
export const memberFromListed = (
  membership: { userId: string; role: MembershipRole; joinedAt: string },
  user: { email: string; name?: string; kind?: PrincipalKind } | undefined
): Member => ({
  userId: membership.userId,
  email: user?.email ?? 'unknown',
  name: user?.name,
  kind: user ? (user.kind ?? 'human') : 'human',
  role: membership.role,
  joinedAt: membership.joinedAt,
});

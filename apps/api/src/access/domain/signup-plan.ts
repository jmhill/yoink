import type { Invitation } from './invitation.js';
import type { OwnerAssigned } from './membership-events.js';
import type { OrganizationMembership } from './organization-membership.js';
import type { Organization } from './organization.js';
import type { PasskeyCredential } from './passkey-credential.js';
import type { UserSession } from './user-session.js';
import type { User } from './user.js';

/**
 * One signup write. The user insert is the only guard. Later statements
 * insert nothing when that user row is absent, so a unique-email miss stays
 * a rowsAffected conflict instead of a foreign-key throw.
 */
export type SignupPlan = {
  readonly user: User;
  readonly personalOrganization: Organization;
  readonly personalMembership: OrganizationMembership;
  readonly invitedMembership: OrganizationMembership;
  readonly accepted: Invitation;
  readonly event: OwnerAssigned | null;
  readonly credential: PasskeyCredential;
  readonly session: UserSession;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const hasString = (value: unknown, key: string): boolean =>
  isRecord(value) && typeof value[key] === 'string';

export const isSignupPlan = (plan: unknown): plan is SignupPlan => {
  if (!isRecord(plan)) {
    return false;
  }
  return (
    hasString(plan.user, 'id') &&
    hasString(plan.user, 'email') &&
    hasString(plan.personalOrganization, 'id') &&
    hasString(plan.personalMembership, 'id') &&
    hasString(plan.invitedMembership, 'id') &&
    hasString(plan.accepted, 'id') &&
    hasString(plan.credential, 'id') &&
    hasString(plan.session, 'id') &&
    (plan.event === null || hasString(plan.event, 'id'))
  );
};

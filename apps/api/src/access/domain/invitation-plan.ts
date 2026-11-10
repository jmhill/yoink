import type { Invitation } from './invitation.js';

/**
 * One invitation write. The access participant compiles it. The unit of
 * work does not inspect it. `kind` keeps these plans distinct from signup,
 * admin, and mint-agent. Create and revoke do not carry a membership.
 * Accept writes the member through `handleAcceptInvitation`.
 */
export type CreateInvitationPlan = {
  readonly kind: 'create-invitation';
  readonly invitation: Invitation;
};

export type RevokeInvitationPlan = {
  readonly kind: 'revoke-invitation';
  readonly invitationId: string;
};

export type InvitationPlan = CreateInvitationPlan | RevokeInvitationPlan;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const hasString = (value: unknown, key: string): boolean =>
  isRecord(value) && typeof value[key] === 'string';

export const isInvitationPlan = (plan: unknown): plan is InvitationPlan => {
  if (!isRecord(plan)) {
    return false;
  }
  if (plan.kind === 'create-invitation') {
    return hasString(plan.invitation, 'id') && hasString(plan.invitation, 'code');
  }
  if (plan.kind === 'revoke-invitation') {
    return typeof plan.invitationId === 'string';
  }
  return false;
};

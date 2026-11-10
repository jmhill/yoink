import { err, ok, type Result } from 'neverthrow';
import type { CreateInvitationPlan } from './invitation-plan.js';
import type { Invitation, InvitationRole } from './invitation.js';
import {
  insufficientInvitePermissionsError,
  invitationOrgNotFoundError,
  type InsufficientInvitePermissionsError,
  type InvitationOrgNotFoundError,
} from './invitation-errors.js';
import type { MembershipRole } from './organization-membership.js';

const DEFAULT_EXPIRY_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

export type CreateInvitationCommand = {
  readonly organizationId: string;
  /** The user creating the invitation. Null for admin-created invitations. */
  readonly invitedByUserId: string | null;
  readonly role: InvitationRole;
  /** Optional email restriction. Only this email can use the invitation. */
  readonly email?: string;
  /** Optional custom expiry. The default is 7 days from now. */
  readonly expiresInDays?: number;
  /** Skip the permission check for admin-created invitations. */
  readonly skipPermissionCheck?: boolean;
};

/** The command after the workspace is present. No membership query has run. */
export type CreateInvitationRequest = {
  readonly organizationId: string;
  readonly invitedByUserId: string | null;
  readonly role: InvitationRole;
  readonly email: string | null;
  readonly expiresInDays: number;
  readonly skipPermissionCheck: boolean;
};

/** The organization query only needs to show that the workspace is there. */
export type CreateInvitationOrganization = {
  readonly id: string;
} | null;

/** The membership query only needs the role that gates inviting. */
export type CreateInvitationMembership = {
  readonly role: MembershipRole;
} | null;

export type CreateInvitationGate =
  | { readonly kind: 'ready' }
  | { readonly kind: 'check-membership'; readonly invitedByUserId: string };

export type DecideCreateInvitationOrganizationError = InvitationOrgNotFoundError;

export type DecideCreateInvitationPermissionError = InsufficientInvitePermissionsError;

/**
 * The workspace query goes in first. A missing workspace is refused before
 * the inviter is checked, matching the previous service order.
 */
export const decideCreateInvitationOrganization = (input: {
  readonly command: CreateInvitationCommand;
  readonly organization: CreateInvitationOrganization;
}): Result<CreateInvitationRequest, DecideCreateInvitationOrganizationError> => {
  if (!input.organization) {
    return err(invitationOrgNotFoundError(input.command.organizationId));
  }

  return ok({
    organizationId: input.command.organizationId,
    invitedByUserId: input.command.invitedByUserId,
    role: input.command.role,
    email: input.command.email ?? null,
    expiresInDays: input.command.expiresInDays ?? DEFAULT_EXPIRY_DAYS,
    skipPermissionCheck: input.command.skipPermissionCheck === true,
  });
};

/**
 * Admin-created invites skip the membership query. A missing inviter is
 * refused before that query. An inviter still needs the membership.
 */
export const decideCreateInvitationPermission = (
  request: CreateInvitationRequest
): Result<CreateInvitationGate, DecideCreateInvitationPermissionError> => {
  if (request.skipPermissionCheck) {
    return ok({ kind: 'ready' });
  }
  if (!request.invitedByUserId) {
    return err(insufficientInvitePermissionsError('admin', 'none'));
  }
  return ok({ kind: 'check-membership', invitedByUserId: request.invitedByUserId });
};

/**
 * The membership query goes in. A missing membership and a member role are
 * both refused. Owner and admin may invite.
 */
export const decideCreateInvitationMembership = (input: {
  readonly membership: CreateInvitationMembership;
}): Result<void, DecideCreateInvitationPermissionError> => {
  if (!input.membership || (input.membership.role !== 'admin' && input.membership.role !== 'owner')) {
    return err(insufficientInvitePermissionsError('admin', input.membership?.role ?? 'none'));
  }
  return ok(undefined);
};

/**
 * One new invitation row. The code is already generated. Nothing here is a
 * membership.
 */
export const planCreateInvitation = (input: {
  readonly request: CreateInvitationRequest;
  readonly id: string;
  readonly code: string;
  readonly now: string;
}): CreateInvitationPlan => {
  const invitation: Invitation = {
    id: input.id,
    code: input.code,
    email: input.request.email,
    organizationId: input.request.organizationId,
    invitedByUserId: input.request.invitedByUserId,
    role: input.request.role,
    expiresAt: new Date(Date.parse(input.now) + input.request.expiresInDays * DAY_MS).toISOString(),
    acceptedAt: null,
    acceptedByUserId: null,
    replacedAt: null,
    createdAt: input.now,
  };
  return { kind: 'create-invitation', invitation };
};

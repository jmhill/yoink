import { err, ok, type Result } from 'neverthrow';
import { normalizeEmail } from '@yoink/api-contracts';
import type { Organization } from './organization.js';
import type { OrganizationMembership } from './organization-membership.js';
import type { Invitation } from './invitation.js';
import { markInvitationReplaced, ownerInvitationExpiresAt } from './invitation.js';
import type { OwnerAssigned } from './membership-events.js';
import { principalKindOf, type User } from './user.js';
import { decideBotMayHaveRole } from './decide-bot-role.js';
import { ownerOf } from './owner-presence.js';
import {
  assignOwnerByAdding,
  assignOwnerByPromoting,
  type AssignOwnerPlan,
} from './assign-owner-plan.js';
import {
  personalWorkspaceOwnerInvitationError,
  workspaceAlreadyHasOwnerError,
  type PersonalWorkspaceOwnerInvitationError,
  type WorkspaceAlreadyHasOwnerError,
} from './invitation-errors.js';
import type { BotCannotHavePrivilegedRoleError } from './organization-errors.js';

export type IssueOwnerInvitation = {
  organizationId: string;
  email: string;
};

export type IssueOwnerInvitationIds = {
  membershipId: string;
  invitationId: string;
  eventId: string;
  code: string;
};

export type DecideIssueOwnerInvitationInput = {
  command: IssueOwnerInvitation;
  organization: Organization;
  members: readonly OrganizationMembership[];
  pendingOwnerInvitation: Invitation | null;
  account: User | null;
  ids: IssueOwnerInvitationIds;
  now: string;
};

export type IssueOwnerInvitationDecision =
  | {
      kind: 'owner-assigned';
      plan: AssignOwnerPlan;
      event: OwnerAssigned;
      replaced: Invitation | null;
      owner: User;
    }
  | {
      kind: 'owner-invited';
      invitation: Invitation;
      replaced: Invitation | null;
    };

export type IssueOwnerInvitationError =
  | PersonalWorkspaceOwnerInvitationError
  | WorkspaceAlreadyHasOwnerError
  | BotCannotHavePrivilegedRoleError;

const isPersonalWorkspace = (members: readonly OrganizationMembership[]): boolean =>
  members.some((membership) => membership.isPersonalOrg);

export const decideIssueOwnerInvitation = ({
  command,
  organization,
  members,
  pendingOwnerInvitation,
  account,
  ids,
  now,
}: DecideIssueOwnerInvitationInput): Result<
  IssueOwnerInvitationDecision,
  IssueOwnerInvitationError
> => {
  if (isPersonalWorkspace(members)) {
    return err(personalWorkspaceOwnerInvitationError(organization.id));
  }

  if (ownerOf(members)) {
    return err(workspaceAlreadyHasOwnerError(organization.id));
  }

  const email = normalizeEmail(command.email);
  const replaced =
    pendingOwnerInvitation === null
      ? null
      : markInvitationReplaced(pendingOwnerInvitation, now);

  if (account) {
    const botCheck = decideBotMayHaveRole(principalKindOf(account), 'owner');
    if (botCheck.isErr()) {
      return err(botCheck.error);
    }

    const existing = members.find((entry) => entry.userId === account.id) ?? null;
    const fromRole =
      existing === null ? null : existing.role === 'owner' ? null : existing.role;
    const plan: AssignOwnerPlan =
      existing === null
        ? assignOwnerByAdding({
            id: ids.membershipId,
            userId: account.id,
            organizationId: organization.id,
            role: 'owner',
            isPersonalOrg: false,
            joinedAt: now,
          })
        : assignOwnerByPromoting(members, existing);
    const event: OwnerAssigned = {
      type: 'OwnerAssigned',
      id: ids.eventId,
      organizationId: organization.id,
      userId: account.id,
      fromRole,
      previousOwnerUserId: null,
      actor: { kind: 'app-admin' },
      occurredAt: now,
    };
    return ok({ kind: 'owner-assigned', plan, event, replaced, owner: account });
  }

  const invitation: Invitation = {
    id: ids.invitationId,
    code: ids.code,
    email,
    organizationId: organization.id,
    invitedByUserId: null,
    role: 'owner',
    expiresAt: ownerInvitationExpiresAt(now),
    acceptedAt: null,
    acceptedByUserId: null,
    replacedAt: null,
    createdAt: now,
  };
  return ok({ kind: 'owner-invited', invitation, replaced });
};

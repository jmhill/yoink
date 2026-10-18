import { err, ok, type Result } from 'neverthrow';
import { normalizeEmail } from '@yoink/api-contracts';
import type { Organization } from './organization.js';
import type { OrganizationMembership } from './organization-membership.js';
import type { Invitation } from './invitation.js';
import { ownerInvitationExpiresAt } from './invitation.js';
import type { OwnerAssigned } from './membership-events.js';
import { principalKindOf, type User } from './user.js';
import { decideBotMayHaveRole } from './decide-bot-role.js';
import type { BotCannotHavePrivilegedRoleError } from './organization-errors.js';

export type CreateWorkspace = {
  name: string;
  ownerEmail: string;
};

export type CreateWorkspaceIds = {
  organizationId: string;
  membershipId: string;
  invitationId: string;
  eventId: string;
  code: string;
};

export type DecideCreateWorkspaceInput = {
  command: CreateWorkspace;
  ownerAccount: User | null;
  ids: CreateWorkspaceIds;
  now: string;
};

export type CreateWorkspaceDecision =
  | {
      kind: 'owner-assigned';
      organization: Organization;
      membership: OrganizationMembership;
      event: OwnerAssigned;
    }
  | {
      kind: 'owner-invited';
      organization: Organization;
      invitation: Invitation;
    };

export type CreateWorkspaceError = BotCannotHavePrivilegedRoleError;

export const decideCreateWorkspace = ({
  command,
  ownerAccount,
  ids,
  now,
}: DecideCreateWorkspaceInput): Result<CreateWorkspaceDecision, CreateWorkspaceError> => {
  const organization: Organization = {
    id: ids.organizationId,
    name: command.name,
    createdAt: now,
  };
  const email = normalizeEmail(command.ownerEmail);

  if (ownerAccount) {
    const botCheck = decideBotMayHaveRole(principalKindOf(ownerAccount), 'owner');
    if (botCheck.isErr()) {
      return err(botCheck.error);
    }

    const membership: OrganizationMembership = {
      id: ids.membershipId,
      userId: ownerAccount.id,
      organizationId: organization.id,
      role: 'owner',
      isPersonalOrg: false,
      joinedAt: now,
    };
    const event: OwnerAssigned = {
      type: 'OwnerAssigned',
      id: ids.eventId,
      organizationId: organization.id,
      userId: ownerAccount.id,
      fromRole: null,
      previousOwnerUserId: null,
      actor: { kind: 'app-admin' },
      occurredAt: now,
    };
    return ok({ kind: 'owner-assigned', organization, membership, event });
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
  return ok({ kind: 'owner-invited', organization, invitation });
};

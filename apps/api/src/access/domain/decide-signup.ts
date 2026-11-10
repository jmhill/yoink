import { err, ok, type Result } from 'neverthrow';
import {
  decideAcceptInvitation,
  type AcceptDecision,
  type AcceptInvitationError,
} from './decide-accept-invitation.js';
import type { Invitation } from './invitation.js';
import { invitationNotFoundError } from './invitation-errors.js';
import type { OrganizationMembership } from './organization-membership.js';
import type { Organization } from './organization.js';
import type { OwnerAssigned } from './membership-events.js';
import type { User } from './user.js';
import {
  emailAlreadyRegisteredError,
  organizationNotFoundError,
  type SignupEmailAlreadyRegisteredError,
  type SignupOrganizationNotFoundError,
} from './signup-commands.js';

export type SignupContext = {
  invitation: Invitation;
  organization: Organization;
  accepted: Invitation;
  invitedMembership: OrganizationMembership;
  event: OwnerAssigned | null;
};

export const decideInvitationLoaded = (
  invitation: Invitation | null,
  code: string
): Result<Invitation, ReturnType<typeof invitationNotFoundError>> =>
  invitation ? ok(invitation) : err(invitationNotFoundError({ code }));

export const decideSignupEmail = (
  email: string,
  existingUser: User | null
): Result<void, SignupEmailAlreadyRegisteredError> =>
  existingUser ? err(emailAlreadyRegisteredError(email)) : ok(undefined);

export const decideSignupOrganization = (
  organization: Organization | null,
  organizationId: string
): Result<Organization, SignupOrganizationNotFoundError> =>
  organization ? ok(organization) : err(organizationNotFoundError(organizationId));

export const signupContextFrom = (
  invitation: Invitation,
  organization: Organization,
  accepted: AcceptDecision
): SignupContext => ({
  invitation,
  organization,
  accepted: accepted.accepted,
  invitedMembership: accepted.membership.membership,
  event: accepted.event,
});

export type SignupRecords = {
  user: User;
  personalOrganization: Organization;
  personalMembership: OrganizationMembership;
  invitedMembership: OrganizationMembership;
  accepted: Invitation;
  event: OwnerAssigned | null;
};

export const signupRecords = (input: {
  email: string;
  userId: string;
  personalOrgId: string;
  personalMembershipId: string;
  now: string;
  context: SignupContext;
}): SignupRecords => ({
  user: { id: input.userId, email: input.email, createdAt: input.now },
  personalOrganization: {
    id: input.personalOrgId,
    name: `${input.email}'s Workspace`,
    createdAt: input.now,
  },
  personalMembership: {
    id: input.personalMembershipId,
    userId: input.userId,
    organizationId: input.personalOrgId,
    role: 'owner',
    isPersonalOrg: true,
    joinedAt: input.now,
  },
  invitedMembership: input.context.invitedMembership,
  accepted: input.context.accepted,
  event: input.context.event,
});

export const decideSignupAcceptance = (input: {
  code: string;
  email: string;
  userId: string;
  invitation: Invitation | null;
  members: readonly OrganizationMembership[];
  now: string;
  eventId: string;
  invitedMembershipId: string;
}): Result<AcceptDecision, AcceptInvitationError> => {
  const loaded = decideInvitationLoaded(input.invitation, input.code);
  if (loaded.isErr()) {
    return err(loaded.error);
  }
  return decideAcceptInvitation({
    command: { code: input.code, account: { userId: input.userId, email: input.email } },
    invitation: loaded.value,
    members: input.members,
    now: input.now,
    eventId: input.eventId,
    membershipId: input.invitedMembershipId,
  });
};

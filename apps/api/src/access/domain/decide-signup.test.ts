import { describe, expect, it } from 'vitest';
import { OWNER_INVITE_WRONG_EMAIL_MESSAGE } from '@yoink/api-contracts';
import {
  decideInvitationLoaded,
  decideSignupAcceptance,
  decideSignupEmail,
  decideSignupOrganization,
  signupContextFrom,
  signupRecords,
} from './decide-signup.js';
import type { Invitation } from './invitation.js';
import type { Organization } from './organization.js';
import type { User } from './user.js';

const NOW = '2024-06-15T10:00:00.000Z';
const ORG: Organization = {
  id: '550e8400-e29b-41d4-a716-446655440001',
  name: 'Acme Corp',
  createdAt: '2024-01-01T00:00:00.000Z',
};

const invitation = (overrides: Partial<Invitation> = {}): Invitation => ({
  id: '550e8400-e29b-41d4-a716-446655440100',
  code: 'ABCD1234',
  email: 'alice@example.com',
  organizationId: ORG.id,
  invitedByUserId: '550e8400-e29b-41d4-a716-446655440002',
  role: 'member',
  expiresAt: '2024-12-31T00:00:00.000Z',
  acceptedAt: null,
  acceptedByUserId: null,
  replacedAt: null,
  createdAt: '2024-01-01T00:00:00.000Z',
  ...overrides,
});

const accept = (invite: Invitation, email = 'alice@example.com') =>
  decideSignupAcceptance({
    code: invite.code,
    email,
    userId: 'user-1',
    invitation: invite,
    members: [],
    now: NOW,
    eventId: 'event-1',
    invitedMembershipId: 'membership-invited',
  });

describe('decide signup', () => {
  it('rejects a missing invitation before any other fact', () => {
    const loaded = decideInvitationLoaded(null, 'MISSING');
    expect(loaded.isErr() && loaded.error).toEqual({
      type: 'INVITATION_NOT_FOUND',
      code: 'MISSING',
    });

    const decided = decideSignupAcceptance({
      code: 'MISSING',
      email: 'alice@example.com',
      userId: 'user-1',
      invitation: null,
      members: [],
      now: NOW,
      eventId: 'event-1',
      invitedMembershipId: 'membership-invited',
    });
    expect(decided.isErr() && decided.error.type).toBe('INVITATION_NOT_FOUND');
  });

  it('rejects an expired invitation', () => {
    const decided = accept(invitation({ expiresAt: '2024-01-01T00:00:00.000Z' }));
    expect(decided.isErr() && decided.error.type).toBe('INVITATION_EXPIRED');
  });

  it('rejects an invitation that was already accepted', () => {
    const decided = accept(
      invitation({
        acceptedAt: '2024-06-01T00:00:00.000Z',
        acceptedByUserId: 'someone',
      })
    );
    expect(decided.isErr() && decided.error.type).toBe('INVITATION_ALREADY_ACCEPTED');
  });

  it('rejects an email that does not match the invitation', () => {
    const decided = accept(invitation(), 'bob@example.com');
    expect(decided.isErr() && decided.error.type).toBe('INVITATION_EMAIL_MISMATCH');
    if (decided.isErr() && decided.error.type === 'INVITATION_EMAIL_MISMATCH') {
      expect(decided.error.message).toBe(OWNER_INVITE_WRONG_EMAIL_MESSAGE);
    }
  });

  it('accepts a restricted email ignoring capitals', () => {
    const decided = accept(invitation(), 'Alice@Example.COM');
    expect(decided.isOk()).toBe(true);
  });

  it('accepts an invitation without an email restriction', () => {
    const decided = accept(invitation({ email: null }), 'anyone@example.com');
    expect(decided.isOk()).toBe(true);
  });

  it('rejects an email that is already registered before the organization check', () => {
    const existing: User = {
      id: 'existing-user',
      email: 'alice@example.com',
      createdAt: '2024-01-01T00:00:00.000Z',
    };
    const emailDecision = decideSignupEmail('alice@example.com', existing);
    expect(emailDecision.isErr() && emailDecision.error).toEqual({
      type: 'EMAIL_ALREADY_REGISTERED',
      email: 'alice@example.com',
    });
  });

  it('rejects a missing organization', () => {
    const orgDecision = decideSignupOrganization(null, ORG.id);
    expect(orgDecision.isErr() && orgDecision.error).toEqual({
      type: 'ORGANIZATION_NOT_FOUND',
      organizationId: ORG.id,
    });
  });

  it('plans a personal workspace, an owner membership, and the invited role', () => {
    const invite = invitation({ role: 'admin' });
    const decided = accept(invite);
    expect(decided.isOk()).toBe(true);
    if (decided.isErr()) {
      return;
    }
    const context = signupContextFrom(invite, ORG, decided.value);
    const records = signupRecords({
      email: 'alice@example.com',
      userId: 'user-1',
      personalOrgId: 'personal-org',
      personalMembershipId: 'personal-membership',
      now: NOW,
      context,
    });

    expect(records.personalOrganization.name).toBe("alice@example.com's Workspace");
    expect(records.personalMembership.role).toBe('owner');
    expect(records.personalMembership.isPersonalOrg).toBe(true);
    expect(records.invitedMembership.role).toBe('admin');
    expect(records.invitedMembership.isPersonalOrg).toBe(false);
    expect(records.invitedMembership.organizationId).toBe(ORG.id);
    expect(records.accepted.acceptedAt).toBe(NOW);
    expect(records.accepted.acceptedByUserId).toBe('user-1');
    expect(records.event).toBeNull();
  });
});

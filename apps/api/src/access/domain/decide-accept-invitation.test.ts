import { describe, it, expect } from 'vitest';
import {
  INVITATION_REPLACED_MESSAGE,
  OWNER_INVITE_WRONG_EMAIL_MESSAGE,
  WORKSPACE_ALREADY_HAS_OWNER_MESSAGE,
} from '@yoink/api-contracts';
import { decideAcceptInvitation } from './decide-accept-invitation.js';
import type { Invitation } from './invitation.js';
import type { OrganizationMembership } from './organization-membership.js';

const now = '2024-06-15T12:00:00.000Z';
const orgId = '550e8400-e29b-41d4-a716-446655440001';
const eventId = '550e8400-e29b-41d4-a716-446655440004';
const membershipId = '550e8400-e29b-41d4-a716-446655440002';
const libby = {
  userId: '550e8400-e29b-41d4-a716-446655440010',
  email: 'libby@example.com',
};

const invite = (overrides: Partial<Invitation> = {}): Invitation => ({
  id: '550e8400-e29b-41d4-a716-446655440030',
  code: 'OWNER001',
  email: 'libby@example.com',
  organizationId: orgId,
  invitedByUserId: null,
  role: 'owner',
  expiresAt: '2024-06-22T12:00:00.000Z',
  acceptedAt: null,
  acceptedByUserId: null,
  replacedAt: null,
  createdAt: '2024-06-08T12:00:00.000Z',
  ...overrides,
});

const member = (overrides: Partial<OrganizationMembership> = {}): OrganizationMembership => ({
  id: '550e8400-e29b-41d4-a716-446655440020',
  userId: libby.userId,
  organizationId: orgId,
  role: 'member',
  isPersonalOrg: false,
  joinedAt: '2024-01-01T00:00:00.000Z',
  ...overrides,
});

const decide = (input: {
  invitation: Invitation | null;
  members?: readonly OrganizationMembership[];
  account?: { userId: string; email: string };
}) =>
  decideAcceptInvitation({
    command: { code: 'OWNER001', account: input.account ?? libby },
    invitation: input.invitation,
    members: input.members ?? [],
    now,
    eventId,
    membershipId,
  });

describe('decideAcceptInvitation', () => {
  it('makes the matching email owner with OwnerAssigned self', () => {
    const result = decide({ invitation: invite() });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.accepted.acceptedByUserId).toBe(libby.userId);
      expect(result.value.membership.kind).toBe('add');
      expect(result.value.membership.membership.role).toBe('owner');
      expect(result.value.event).toEqual({
        type: 'OwnerAssigned',
        id: eventId,
        organizationId: orgId,
        userId: libby.userId,
        fromRole: null,
        previousOwnerUserId: null,
        actor: { kind: 'self', userId: libby.userId },
        occurredAt: now,
      });
    }
  });

  it('promotes an existing member to owner', () => {
    const result = decide({
      invitation: invite(),
      members: [member({ role: 'admin' })],
    });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.membership.kind).toBe('promote');
      expect(result.value.event?.fromRole).toBe('admin');
    }
  });

  it('refuses a different email with the owner text and leaves the invite unused', () => {
    const pending = invite();
    const result = decide({
      invitation: pending,
      account: { userId: '550e8400-e29b-41d4-a716-446655440099', email: 'other@example.com' },
    });
    expect(result.isErr() && result.error.type).toBe('INVITATION_EMAIL_MISMATCH');
    if (result.isErr() && result.error.type === 'INVITATION_EMAIL_MISMATCH') {
      expect(result.error.message).toBe(OWNER_INVITE_WRONG_EMAIL_MESSAGE);
    }
    expect(pending.acceptedAt).toBeNull();
    expect(pending.replacedAt).toBeNull();
  });

  it('matches owner email ignoring capitals and spaces', () => {
    const result = decide({
      invitation: invite({ email: 'libby@example.com' }),
      account: { ...libby, email: '  Libby@Example.COM  ' },
    });
    expect(result.isOk()).toBe(true);
  });

  it('refuses a replaced invite first', () => {
    const result = decide({
      invitation: invite({
        replacedAt: '2024-06-14T12:00:00.000Z',
        expiresAt: '2024-06-01T12:00:00.000Z',
        acceptedAt: '2024-06-01T12:00:00.000Z',
      }),
    });
    expect(result.isErr() && result.error.type).toBe('INVITATION_REPLACED');
    if (result.isErr() && result.error.type === 'INVITATION_REPLACED') {
      expect(result.error.message).toBe(INVITATION_REPLACED_MESSAGE);
    }
  });

  it('refuses an expired invite', () => {
    const result = decide({
      invitation: invite({ expiresAt: '2024-06-01T12:00:00.000Z' }),
    });
    expect(result.isErr() && result.error.type).toBe('INVITATION_EXPIRED');
  });

  it('refuses an already used invite', () => {
    const result = decide({
      invitation: invite({
        acceptedAt: '2024-06-10T12:00:00.000Z',
        acceptedByUserId: libby.userId,
      }),
    });
    expect(result.isErr() && result.error.type).toBe('INVITATION_ALREADY_ACCEPTED');
  });

  it('refuses when the workspace already has an owner', () => {
    const result = decide({
      invitation: invite(),
      members: [
        member({
          userId: '550e8400-e29b-41d4-a716-446655440012',
          role: 'owner',
        }),
      ],
    });
    expect(result.isErr() && result.error.type).toBe('WORKSPACE_ALREADY_HAS_OWNER');
    if (result.isErr() && result.error.type === 'WORKSPACE_ALREADY_HAS_OWNER') {
      expect(result.error.message).toBe(WORKSPACE_ALREADY_HAS_OWNER_MESSAGE);
    }
  });

  it('refuses a missing invitation', () => {
    const result = decide({ invitation: null });
    expect(result.isErr() && result.error.type).toBe('INVITATION_NOT_FOUND');
  });

  it('keeps member invites without an email as an open link and 409s if already a member', () => {
    const memberInvite = invite({ role: 'member', email: null });
    const otherEmail = decide({
      invitation: memberInvite,
      account: { userId: '550e8400-e29b-41d4-a716-446655440099', email: 'other@example.com' },
    });
    expect(otherEmail.isOk()).toBe(true);
    if (otherEmail.isOk()) {
      expect(otherEmail.value.event).toBeNull();
      expect(otherEmail.value.membership.membership.role).toBe('member');
    }

    const already = decide({
      invitation: memberInvite,
      members: [member()],
    });
    expect(already.isErr() && already.error.type).toBe('ALREADY_MEMBER_OF_ORG');
  });

  it('refuses a member invite for a different email and leaves it unused', () => {
    const pending = invite({ role: 'member', email: 'libby@example.com' });
    const result = decide({
      invitation: pending,
      account: { userId: '550e8400-e29b-41d4-a716-446655440099', email: 'other@example.com' },
    });
    expect(result.isErr() && result.error.type).toBe('INVITATION_EMAIL_MISMATCH');
    if (result.isErr() && result.error.type === 'INVITATION_EMAIL_MISMATCH') {
      expect(result.error.message).toBe(OWNER_INVITE_WRONG_EMAIL_MESSAGE);
    }
    expect(pending.acceptedAt).toBeNull();
  });

  it('matches a member invite email ignoring capitals and spaces', () => {
    const result = decide({
      invitation: invite({ role: 'member', email: 'libby@example.com' }),
      account: { ...libby, email: '  Libby@Example.COM  ' },
    });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.membership.membership.role).toBe('member');
      expect(result.value.event).toBeNull();
    }
  });

  it('refuses an admin invite for a different email', () => {
    const result = decide({
      invitation: invite({ role: 'admin', email: 'libby@example.com' }),
      account: { userId: '550e8400-e29b-41d4-a716-446655440099', email: 'other@example.com' },
    });
    expect(result.isErr() && result.error.type).toBe('INVITATION_EMAIL_MISMATCH');
  });

  it('keeps admin invites without an email as an open link', () => {
    const result = decide({ invitation: invite({ role: 'admin', email: null }) });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.membership.membership.role).toBe('admin');
      expect(result.value.event).toBeNull();
    }
  });
});

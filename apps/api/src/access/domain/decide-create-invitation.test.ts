import { describe, expect, it } from 'vitest';
import {
  decideCreateInvitationMembership,
  decideCreateInvitationOrganization,
  decideCreateInvitationPermission,
  planCreateInvitation,
  type CreateInvitationCommand,
} from './decide-create-invitation.js';

const ORG_ID = '550e8400-e29b-41d4-a716-446655440001';
const ADMIN_ID = '550e8400-e29b-41d4-a716-446655440010';
const NOW = '2024-01-15T12:00:00.000Z';

const command = (overrides: Partial<CreateInvitationCommand> = {}): CreateInvitationCommand => ({
  organizationId: ORG_ID,
  invitedByUserId: ADMIN_ID,
  role: 'member',
  ...overrides,
});

describe('decideCreateInvitationOrganization', () => {
  it('keeps the workspace and fills the defaults', () => {
    const decision = decideCreateInvitationOrganization({
      command: command({ email: 'specific@example.com' }),
      organization: { id: ORG_ID },
    });
    expect(decision.isOk() && decision.value).toEqual({
      organizationId: ORG_ID,
      invitedByUserId: ADMIN_ID,
      role: 'member',
      email: 'specific@example.com',
      expiresInDays: 7,
      skipPermissionCheck: false,
    });
  });

  it('keeps a custom expiry and an admin skip', () => {
    const decision = decideCreateInvitationOrganization({
      command: command({
        invitedByUserId: null,
        role: 'admin',
        expiresInDays: 30,
        skipPermissionCheck: true,
      }),
      organization: { id: ORG_ID },
    });
    expect(decision.isOk() && decision.value.expiresInDays).toBe(30);
    expect(decision.isOk() && decision.value.skipPermissionCheck).toBe(true);
    expect(decision.isOk() && decision.value.email).toBeNull();
  });

  it('refuses a missing workspace before the inviter is checked', () => {
    const decision = decideCreateInvitationOrganization({
      command: command({ invitedByUserId: null }),
      organization: null,
    });
    expect(decision.isErr() && decision.error.type).toBe('INVITATION_ORG_NOT_FOUND');
  });
});

describe('decideCreateInvitationPermission', () => {
  const request = {
    organizationId: ORG_ID,
    invitedByUserId: ADMIN_ID,
    role: 'member' as const,
    email: null,
    expiresInDays: 7,
    skipPermissionCheck: false,
  };

  it('asks for the membership when an inviter is present', () => {
    const decision = decideCreateInvitationPermission(request);
    expect(decision.isOk() && decision.value).toEqual({
      kind: 'check-membership',
      invitedByUserId: ADMIN_ID,
    });
  });

  it('skips the membership query for an admin-created invite', () => {
    const decision = decideCreateInvitationPermission({
      ...request,
      invitedByUserId: null,
      skipPermissionCheck: true,
    });
    expect(decision.isOk() && decision.value).toEqual({ kind: 'ready' });
  });

  it('refuses a missing inviter before the membership query', () => {
    const decision = decideCreateInvitationPermission({
      ...request,
      invitedByUserId: null,
    });
    expect(decision.isErr() && decision.error).toMatchObject({
      type: 'INSUFFICIENT_INVITE_PERMISSIONS',
      requiredRole: 'admin',
      actualRole: 'none',
    });
  });
});

describe('decideCreateInvitationMembership', () => {
  it('accepts an owner', () => {
    const decision = decideCreateInvitationMembership({ membership: { role: 'owner' } });
    expect(decision.isOk()).toBe(true);
  });

  it('accepts an admin', () => {
    const decision = decideCreateInvitationMembership({ membership: { role: 'admin' } });
    expect(decision.isOk()).toBe(true);
  });

  it('refuses a missing membership', () => {
    const decision = decideCreateInvitationMembership({ membership: null });
    expect(decision.isErr() && decision.error).toMatchObject({
      type: 'INSUFFICIENT_INVITE_PERMISSIONS',
      actualRole: 'none',
    });
  });

  it('refuses a member', () => {
    const decision = decideCreateInvitationMembership({ membership: { role: 'member' } });
    expect(decision.isErr() && decision.error).toMatchObject({
      type: 'INSUFFICIENT_INVITE_PERMISSIONS',
      requiredRole: 'admin',
      actualRole: 'member',
    });
  });
});

describe('planCreateInvitation', () => {
  it('plans one invitation and no membership', () => {
    const plan = planCreateInvitation({
      request: {
        organizationId: ORG_ID,
        invitedByUserId: ADMIN_ID,
        role: 'member',
        email: 'specific@example.com',
        expiresInDays: 7,
        skipPermissionCheck: false,
      },
      id: '550e8400-e29b-41d4-a716-446655440200',
      code: 'TESTCODE',
      now: NOW,
    });

    expect(plan.kind).toBe('create-invitation');
    expect(plan.invitation).toEqual({
      id: '550e8400-e29b-41d4-a716-446655440200',
      code: 'TESTCODE',
      email: 'specific@example.com',
      organizationId: ORG_ID,
      invitedByUserId: ADMIN_ID,
      role: 'member',
      expiresAt: '2024-01-22T12:00:00.000Z',
      acceptedAt: null,
      acceptedByUserId: null,
      replacedAt: null,
      createdAt: NOW,
    });
    expect(plan).not.toHaveProperty('membership');
  });

  it('plans a thirty-day admin invite with no inviter', () => {
    const plan = planCreateInvitation({
      request: {
        organizationId: ORG_ID,
        invitedByUserId: null,
        role: 'admin',
        email: null,
        expiresInDays: 30,
        skipPermissionCheck: true,
      },
      id: '550e8400-e29b-41d4-a716-446655440201',
      code: 'ADMINCODE',
      now: NOW,
    });

    expect(plan.invitation.expiresAt).toBe('2024-02-14T12:00:00.000Z');
    expect(plan.invitation.invitedByUserId).toBeNull();
    expect(plan.invitation.role).toBe('admin');
  });
});

import { describe, expect, it } from 'vitest';
import type { Invitation } from './invitation.js';
import {
  decideRevokeInvitation,
  decideRevokeInvitationMembership,
  planRevokeInvitation,
} from './decide-revoke-invitation.js';

const ORG_ID = '550e8400-e29b-41d4-a716-446655440001';
const INVITE_ID = '550e8400-e29b-41d4-a716-446655440201';

const invitation = (role: Invitation['role']): Invitation => ({
  id: INVITE_ID,
  code: 'TESTCODE',
  email: null,
  organizationId: ORG_ID,
  invitedByUserId: '550e8400-e29b-41d4-a716-446655440010',
  role,
  expiresAt: '2024-01-22T12:00:00.000Z',
  acceptedAt: null,
  acceptedByUserId: null,
  replacedAt: null,
  createdAt: '2024-01-15T12:00:00.000Z',
});

const command = {
  invitationId: INVITE_ID,
  revokedByUserId: '550e8400-e29b-41d4-a716-446655440010',
};

describe('decideRevokeInvitation', () => {
  it('returns the workspace for a member invite', () => {
    const decision = decideRevokeInvitation({
      command,
      invitation: invitation('member'),
    });
    expect(decision.isOk() && decision.value).toEqual({ organizationId: ORG_ID });
  });

  it('returns the workspace for an admin invite', () => {
    const decision = decideRevokeInvitation({
      command,
      invitation: invitation('admin'),
    });
    expect(decision.isOk()).toBe(true);
  });

  it('refuses a missing invite before the owner check', () => {
    const decision = decideRevokeInvitation({ command, invitation: null });
    expect(decision.isErr() && decision.error).toMatchObject({
      type: 'INVITATION_NOT_FOUND',
      invitationId: INVITE_ID,
    });
  });

  it('refuses an owner invite before the membership is loaded', () => {
    const decision = decideRevokeInvitation({
      command,
      invitation: invitation('owner'),
    });
    expect(decision.isErr() && decision.error).toMatchObject({
      type: 'OWNER_INVITATION_ADMIN_ONLY',
      invitationId: INVITE_ID,
    });
  });
});

describe('decideRevokeInvitationMembership', () => {
  it('accepts an owner', () => {
    expect(decideRevokeInvitationMembership({ membership: { role: 'owner' } }).isOk()).toBe(true);
  });

  it('accepts an admin', () => {
    expect(decideRevokeInvitationMembership({ membership: { role: 'admin' } }).isOk()).toBe(true);
  });

  it('refuses a missing membership', () => {
    const decision = decideRevokeInvitationMembership({ membership: null });
    expect(decision.isErr() && decision.error).toMatchObject({
      type: 'INSUFFICIENT_INVITE_PERMISSIONS',
      actualRole: 'none',
    });
  });

  it('refuses a member', () => {
    const decision = decideRevokeInvitationMembership({ membership: { role: 'member' } });
    expect(decision.isErr() && decision.error).toMatchObject({
      type: 'INSUFFICIENT_INVITE_PERMISSIONS',
      requiredRole: 'admin',
      actualRole: 'member',
    });
  });
});

describe('planRevokeInvitation', () => {
  it('plans a delete and no membership', () => {
    const plan = planRevokeInvitation({ invitationId: INVITE_ID });
    expect(plan).toEqual({ kind: 'revoke-invitation', invitationId: INVITE_ID });
    expect(plan).not.toHaveProperty('membership');
  });
});

import { describe, expect, it } from 'vitest';
import type { Invitation } from './invitation.js';
import { selectInAppPendingInvitations } from './decide-list-pending-invitations.js';

const invitation = (role: Invitation['role'], id: string): Invitation => ({
  id,
  code: role.toUpperCase(),
  email: null,
  organizationId: '550e8400-e29b-41d4-a716-446655440001',
  invitedByUserId: null,
  role,
  expiresAt: '2024-01-22T12:00:00.000Z',
  acceptedAt: null,
  acceptedByUserId: null,
  replacedAt: null,
  createdAt: '2024-01-15T12:00:00.000Z',
});

describe('selectInAppPendingInvitations', () => {
  it('drops owner invites and keeps the others in order', () => {
    const member = invitation('member', '550e8400-e29b-41d4-a716-446655440201');
    const owner = invitation('owner', '550e8400-e29b-41d4-a716-446655440202');
    const admin = invitation('admin', '550e8400-e29b-41d4-a716-446655440203');

    expect(selectInAppPendingInvitations([member, owner, admin])).toEqual([member, admin]);
  });

  it('returns an empty list when every row is an owner invite', () => {
    const owner = invitation('owner', '550e8400-e29b-41d4-a716-446655440202');
    expect(selectInAppPendingInvitations([owner])).toEqual([]);
  });
});

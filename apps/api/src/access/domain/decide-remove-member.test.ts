import { describe, it, expect } from 'vitest';
import { decideRemoveMember } from './decide-remove-member.js';
import { OWNER_MUST_TRANSFER_MESSAGE } from './organization-errors.js';
import type { OrganizationMembership } from './organization-membership.js';

const orgId = '550e8400-e29b-41d4-a716-446655440001';

const member = (overrides: Partial<OrganizationMembership> = {}): OrganizationMembership => ({
  id: '550e8400-e29b-41d4-a716-446655440020',
  userId: '550e8400-e29b-41d4-a716-446655440010',
  organizationId: orgId,
  role: 'member',
  isPersonalOrg: false,
  joinedAt: '2024-01-01T00:00:00.000Z',
  ...overrides,
});

const owner = member({
  id: '550e8400-e29b-41d4-a716-446655440021',
  userId: '550e8400-e29b-41d4-a716-446655440011',
  role: 'owner',
});

const admin = member({
  id: '550e8400-e29b-41d4-a716-446655440022',
  userId: '550e8400-e29b-41d4-a716-446655440012',
  role: 'admin',
});

describe('decideRemoveMember', () => {
  it('allows removing a member when an owner remains', () => {
    const result = decideRemoveMember({
      command: { userId: member().userId, organizationId: orgId, actorUserId: owner.userId },
      members: [owner, member()],
    });
    expect(result.isOk()).toBe(true);
  });

  it('refuses the owner leaving with Transfer ownership first', () => {
    const result = decideRemoveMember({
      command: { userId: owner.userId, organizationId: orgId },
      members: [owner, admin],
    });
    expect(result.isErr()).toBe(true);
    if (result.isErr() && result.error.type === 'OWNER_MUST_TRANSFER') {
      expect(result.error.message).toBe(OWNER_MUST_TRANSFER_MESSAGE);
    } else {
      expect(result.isErr() && result.error.type).toBe('OWNER_MUST_TRANSFER');
    }
  });

  it('refuses a member removing the owner with INSUFFICIENT_PERMISSIONS (permission before owner)', () => {
    const result = decideRemoveMember({
      command: { userId: owner.userId, organizationId: orgId, actorUserId: member().userId },
      members: [owner, member()],
    });
    expect(result.isErr() && result.error.type).toBe('INSUFFICIENT_PERMISSIONS');
  });

  it('refuses an admin removing the owner with INSUFFICIENT_PERMISSIONS (permission before owner)', () => {
    const result = decideRemoveMember({
      command: { userId: owner.userId, organizationId: orgId, actorUserId: admin.userId },
      members: [owner, admin],
    });
    expect(result.isErr() && result.error.type).toBe('INSUFFICIENT_PERMISSIONS');
  });

  it('refuses leaving a personal workspace', () => {
    const personal = member({ isPersonalOrg: true, role: 'owner' });
    const result = decideRemoveMember({
      command: { userId: personal.userId, organizationId: orgId },
      members: [personal],
    });
    expect(result.isErr() && result.error.type).toBe('CANNOT_LEAVE_PERSONAL_ORG');
  });

  it('refuses removing the last admin of an ownerless workspace', () => {
    const result = decideRemoveMember({
      command: { userId: admin.userId, organizationId: orgId },
      members: [admin, member()],
    });
    expect(result.isErr() && result.error.type).toBe('LAST_ADMIN');
  });

  it('allows an admin to leave when an owner remains', () => {
    const result = decideRemoveMember({
      command: { userId: admin.userId, organizationId: orgId },
      members: [owner, admin],
    });
    expect(result.isOk()).toBe(true);
  });

  it('refuses a member removing the last admin of an ownerless workspace with INSUFFICIENT_PERMISSIONS', () => {
    const result = decideRemoveMember({
      command: { userId: admin.userId, organizationId: orgId, actorUserId: member().userId },
      members: [admin, member()],
    });
    expect(result.isErr() && result.error.type).toBe('INSUFFICIENT_PERMISSIONS');
  });

  it('refuses a member removing anyone', () => {
    const other = member({
      id: 'other',
      userId: '550e8400-e29b-41d4-a716-446655440099',
    });
    const result = decideRemoveMember({
      command: { userId: other.userId, organizationId: orgId, actorUserId: member().userId },
      members: [owner, member(), other],
    });
    expect(result.isErr() && result.error.type).toBe('INSUFFICIENT_PERMISSIONS');
  });

  it('refuses an admin removing another admin', () => {
    const otherAdmin = member({
      id: 'admin-2',
      userId: '550e8400-e29b-41d4-a716-446655440098',
      role: 'admin',
    });
    const result = decideRemoveMember({
      command: { userId: otherAdmin.userId, organizationId: orgId, actorUserId: admin.userId },
      members: [owner, admin, otherAdmin],
    });
    expect(result.isErr() && result.error.type).toBe('INSUFFICIENT_PERMISSIONS');
  });
});

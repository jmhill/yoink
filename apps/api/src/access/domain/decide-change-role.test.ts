import { describe, it, expect } from 'vitest';
import { decideChangeRole } from './decide-change-role.js';
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

describe('decideChangeRole', () => {
  it('promotes a human member to admin', () => {
    const result = decideChangeRole({
      membership: member(),
      newRole: 'admin',
      targetKind: 'human',
      allMembers: [owner, member()],
    });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.role).toBe('admin');
    }
  });

  it('demotes a human admin to member when an owner remains', () => {
    const result = decideChangeRole({
      membership: admin,
      newRole: 'member',
      targetKind: 'human',
      allMembers: [owner, admin],
    });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.role).toBe('member');
    }
  });

  it('refuses assigning owner', () => {
    const result = decideChangeRole({
      membership: member(),
      newRole: 'owner',
      targetKind: 'human',
      allMembers: [member()],
    });
    expect(result.isErr() && result.error.type).toBe('CANNOT_ASSIGN_OWNER_ROLE');
  });

  it('refuses changing the current owner (would leave the workspace ownerless)', () => {
    const result = decideChangeRole({
      membership: owner,
      newRole: 'admin',
      targetKind: 'human',
      allMembers: [owner, admin],
    });
    expect(result.isErr() && result.error.type).toBe('CANNOT_CHANGE_OWNER_ROLE');
  });

  it('refuses promoting a bot to admin', () => {
    const bot = member({ role: 'member' });
    const result = decideChangeRole({
      membership: bot,
      newRole: 'admin',
      targetKind: 'agent',
      allMembers: [owner, bot],
    });
    expect(result.isErr() && result.error.type).toBe('BOT_CANNOT_HAVE_PRIVILEGED_ROLE');
  });

  it('refuses demoting the last admin of an ownerless workspace', () => {
    const result = decideChangeRole({
      membership: admin,
      newRole: 'member',
      targetKind: 'human',
      allMembers: [admin, member()],
    });
    expect(result.isErr() && result.error.type).toBe('LAST_ADMIN');
  });
});

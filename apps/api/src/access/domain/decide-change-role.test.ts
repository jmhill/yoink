import { describe, it, expect } from 'vitest';
import { decideChangeRole } from './decide-change-role.js';
import { OWNER_MUST_TRANSFER_MAKE_OWNER_MESSAGE } from './organization-errors.js';
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
      command: { organizationId: orgId, userId: member().userId, newRole: 'admin' },
      members: [owner, member()],
      targetKind: 'human',
    });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.role).toBe('admin');
    }
  });

  it('demotes the last admin to member when an owner remains (zero admins allowed)', () => {
    const result = decideChangeRole({
      command: { organizationId: orgId, userId: admin.userId, newRole: 'member' },
      members: [owner, admin],
      targetKind: 'human',
    });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.role).toBe('member');
    }
  });

  it('refuses assigning owner', () => {
    const result = decideChangeRole({
      command: { organizationId: orgId, userId: member().userId, newRole: 'owner' },
      members: [member()],
      targetKind: 'human',
    });
    expect(result.isErr() && result.error.type).toBe('CANNOT_ASSIGN_OWNER_ROLE');
  });

  it('refuses changing the current owner (would leave the workspace ownerless)', () => {
    const result = decideChangeRole({
      command: { organizationId: orgId, userId: owner.userId, newRole: 'admin' },
      members: [owner, admin],
      targetKind: 'human',
    });
    expect(result.isErr() && result.error.type).toBe('OWNER_MUST_TRANSFER');
    if (result.isErr() && result.error.type === 'OWNER_MUST_TRANSFER') {
      expect(result.error.message).toBe(OWNER_MUST_TRANSFER_MAKE_OWNER_MESSAGE);
    }
  });

  it('refuses promoting a bot to admin', () => {
    const bot = member({ role: 'member' });
    const result = decideChangeRole({
      command: { organizationId: orgId, userId: bot.userId, newRole: 'admin' },
      members: [owner, bot],
      targetKind: 'agent',
    });
    expect(result.isErr() && result.error.type).toBe('BOT_CANNOT_HAVE_PRIVILEGED_ROLE');
  });

  it('refuses demoting the last admin of an ownerless workspace', () => {
    const result = decideChangeRole({
      command: { organizationId: orgId, userId: admin.userId, newRole: 'member' },
      members: [admin, member()],
      targetKind: 'human',
    });
    expect(result.isErr() && result.error.type).toBe('LAST_ADMIN');
  });
});

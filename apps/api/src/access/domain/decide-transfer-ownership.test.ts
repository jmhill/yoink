import { describe, it, expect } from 'vitest';
import { decideTransferOwnership } from './decide-transfer-ownership.js';
import type { OrganizationMembership } from './organization-membership.js';
import type { User } from './user.js';

const orgId = '550e8400-e29b-41d4-a716-446655440001';

const justin: User = {
  id: '550e8400-e29b-41d4-a716-446655440010',
  email: 'justin@example.com',
  createdAt: '2024-01-01T00:00:00.000Z',
};

const libby: User = {
  id: '550e8400-e29b-41d4-a716-446655440012',
  email: 'libby@example.com',
  createdAt: '2024-01-01T00:00:00.000Z',
};

const membership = (overrides: Partial<OrganizationMembership> = {}): OrganizationMembership => ({
  id: '550e8400-e29b-41d4-a716-446655440020',
  userId: justin.id,
  organizationId: orgId,
  role: 'member',
  isPersonalOrg: false,
  joinedAt: '2024-01-01T00:00:00.000Z',
  ...overrides,
});

const owner = membership({
  id: '550e8400-e29b-41d4-a716-446655440021',
  role: 'owner',
});

const nextOwner = membership({
  id: '550e8400-e29b-41d4-a716-446655440022',
  userId: libby.id,
  role: 'admin',
});

describe('decideTransferOwnership', () => {
  it('reuses set-owner: old owner becomes admin, target becomes owner', () => {
    const result = decideTransferOwnership({
      command: { organizationId: orgId, fromUserId: justin.id, toUserId: libby.id },
      members: [owner, nextOwner],
      targetUser: libby,
    });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.demote?.userId).toBe(justin.id);
      expect(result.value.demote?.role).toBe('admin');
      expect(result.value.promote.userId).toBe(libby.id);
      expect(result.value.promote.role).toBe('owner');
    }
  });

  it('refuses when fromUserId is not the current owner', () => {
    const result = decideTransferOwnership({
      command: { organizationId: orgId, fromUserId: libby.id, toUserId: justin.id },
      members: [owner, nextOwner],
      targetUser: justin,
    });
    expect(result.isErr() && result.error.type).toBe('NOT_CURRENT_OWNER');
  });

  it('refuses transfer on a zero-owner workspace (use set-owner)', () => {
    const result = decideTransferOwnership({
      command: { organizationId: orgId, fromUserId: justin.id, toUserId: libby.id },
      members: [membership({ role: 'admin' }), nextOwner],
      targetUser: libby,
    });
    expect(result.isErr() && result.error.type).toBe('NOT_CURRENT_OWNER');
  });

  it('refuses transferring to a bot', () => {
    const bot: User = {
      id: '550e8400-e29b-41d4-a716-446655440013',
      email: 'agent@yoink.invalid',
      kind: 'agent',
      createdAt: '2024-01-01T00:00:00.000Z',
    };
    const botMembership = membership({
      id: 'bot-m',
      userId: bot.id,
      role: 'member',
    });
    const result = decideTransferOwnership({
      command: { organizationId: orgId, fromUserId: justin.id, toUserId: bot.id },
      members: [owner, botMembership],
      targetUser: bot,
    });
    expect(result.isErr() && result.error.type).toBe('BOT_CANNOT_HAVE_PRIVILEGED_ROLE');
  });
});

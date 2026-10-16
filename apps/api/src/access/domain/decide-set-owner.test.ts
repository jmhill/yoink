import { describe, it, expect } from 'vitest';
import { decideSetOwner } from './decide-set-owner.js';
import type { OrganizationMembership } from './organization-membership.js';
import type { User } from './user.js';

const orgId = '550e8400-e29b-41d4-a716-446655440001';

const human: User = {
  id: '550e8400-e29b-41d4-a716-446655440010',
  email: 'justin@example.com',
  createdAt: '2024-01-01T00:00:00.000Z',
};

const bot: User = {
  id: '550e8400-e29b-41d4-a716-446655440011',
  email: 'agent-550e8400-e29b-41d4-a716-446655440011@yoink.invalid',
  kind: 'agent',
  createdAt: '2024-01-01T00:00:00.000Z',
};

const membership = (overrides: Partial<OrganizationMembership> = {}): OrganizationMembership => ({
  id: '550e8400-e29b-41d4-a716-446655440020',
  userId: human.id,
  organizationId: orgId,
  role: 'member',
  isPersonalOrg: false,
  joinedAt: '2024-01-01T00:00:00.000Z',
  ...overrides,
});

const currentOwner = membership({
  id: '550e8400-e29b-41d4-a716-446655440021',
  userId: '550e8400-e29b-41d4-a716-446655440012',
  role: 'owner',
});

describe('decideSetOwner', () => {
  it('promotes a human member on a zero-owner workspace', () => {
    const target = membership({ role: 'member' });
    const result = decideSetOwner({
      command: { organizationId: orgId, userId: human.id },
      members: [target],
      targetUser: human,
    });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.demote).toBeNull();
      expect(result.value.promote.role).toBe('owner');
      expect(result.value.promote.userId).toBe(human.id);
    }
  });

  it('demotes the old owner to admin in the same plan', () => {
    const target = membership({ role: 'admin' });
    const result = decideSetOwner({
      command: { organizationId: orgId, userId: human.id },
      members: [currentOwner, target],
      targetUser: human,
    });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.demote?.id).toBe(currentOwner.id);
      expect(result.value.demote?.role).toBe('admin');
      expect(result.value.promote.role).toBe('owner');
    }
  });

  it('is a no-op when the target is already the owner', () => {
    const result = decideSetOwner({
      command: { organizationId: orgId, userId: currentOwner.userId },
      members: [currentOwner],
      targetUser: { ...human, id: currentOwner.userId },
    });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.demote).toBeNull();
      expect(result.value.promote.role).toBe('owner');
    }
  });

  it('refuses a missing user', () => {
    const result = decideSetOwner({
      command: { organizationId: orgId, userId: human.id },
      members: [],
      targetUser: null,
    });
    expect(result.isErr() && result.error.type).toBe('USER_NOT_FOUND');
  });

  it('refuses a non-member', () => {
    const result = decideSetOwner({
      command: { organizationId: orgId, userId: human.id },
      members: [],
      targetUser: human,
    });
    expect(result.isErr() && result.error.type).toBe('TARGET_NOT_WORKSPACE_MEMBER');
  });

  it('refuses a bot', () => {
    const botMembership = membership({ userId: bot.id, role: 'member' });
    const result = decideSetOwner({
      command: { organizationId: orgId, userId: bot.id },
      members: [botMembership],
      targetUser: bot,
    });
    expect(result.isErr() && result.error.type).toBe('BOT_CANNOT_HAVE_PRIVILEGED_ROLE');
  });
});

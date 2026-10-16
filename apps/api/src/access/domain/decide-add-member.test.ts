import { describe, it, expect } from 'vitest';
import { decideAddMember } from './decide-add-member.js';
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
  email: 'agent-bot@yoink.invalid',
  kind: 'agent',
  createdAt: '2024-01-01T00:00:00.000Z',
};

const member = (overrides: Partial<OrganizationMembership> = {}): OrganizationMembership => ({
  id: '550e8400-e29b-41d4-a716-446655440020',
  userId: human.id,
  organizationId: orgId,
  role: 'member',
  isPersonalOrg: false,
  joinedAt: '2024-01-01T00:00:00.000Z',
  ...overrides,
});

describe('decideAddMember', () => {
  it('adds a human member', () => {
    const result = decideAddMember({
      command: { userId: human.id, organizationId: orgId, role: 'member' },
      user: human,
      existing: null,
      members: [],
      membershipId: 'new-id',
      now: '2024-02-01T00:00:00.000Z',
    });
    expect(result.isOk() && result.value.role).toBe('member');
  });

  it('allows the first owner on a zero-owner workspace', () => {
    const result = decideAddMember({
      command: { userId: human.id, organizationId: orgId, role: 'owner' },
      user: human,
      existing: null,
      members: [],
      membershipId: 'new-id',
      now: '2024-02-01T00:00:00.000Z',
    });
    expect(result.isOk() && result.value.role).toBe('owner');
  });

  it('refuses a second owner', () => {
    const result = decideAddMember({
      command: { userId: human.id, organizationId: orgId, role: 'owner' },
      user: human,
      existing: null,
      members: [member({ userId: 'other', role: 'owner' })],
      membershipId: 'new-id',
      now: '2024-02-01T00:00:00.000Z',
    });
    expect(result.isErr() && result.error.type).toBe('SECOND_OWNER');
  });

  it('refuses a bot admin', () => {
    const result = decideAddMember({
      command: { userId: bot.id, organizationId: orgId, role: 'admin' },
      user: bot,
      existing: null,
      members: [],
      membershipId: 'new-id',
      now: '2024-02-01T00:00:00.000Z',
    });
    expect(result.isErr() && result.error.type).toBe('BOT_CANNOT_HAVE_PRIVILEGED_ROLE');
  });

  it('refuses an existing member', () => {
    const existing = member();
    const result = decideAddMember({
      command: { userId: human.id, organizationId: orgId, role: 'member' },
      user: human,
      existing,
      members: [existing],
      membershipId: 'new-id',
      now: '2024-02-01T00:00:00.000Z',
    });
    expect(result.isErr() && result.error.type).toBe('ALREADY_MEMBER');
  });
});

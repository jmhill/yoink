import { describe, it, expect } from 'vitest';
import { decideAddMember, decideAddMemberOrganization, decideAddMemberUser, planAddMember } from './decide-add-member.js';
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
  it('refuses a missing user before the workspace', () => {
    const result = decideAddMemberUser({
      command: { userId: human.id, organizationId: orgId, role: 'member' },
      user: null,
    });
    expect(result.isErr() && result.error.type).toBe('USER_NOT_FOUND');
  });

  it('refuses a missing workspace before memberships are loaded', () => {
    const result = decideAddMemberOrganization({
      command: { userId: human.id, organizationId: orgId, role: 'member' },
      organization: null,
    });
    expect(result.isErr() && result.error.type).toBe('ORGANIZATION_NOT_FOUND');
  });

  it('adds a human member', () => {
    const result = decideAddMember({
      command: { userId: human.id, organizationId: orgId, role: 'member' },
      user: human,
      existing: null,
      members: [],
    });
    expect(result.isOk() && result.value.role).toBe('member');
    expect(result.isOk() && result.value.isPersonalOrg).toBe(false);
  });

  it('keeps a personal workspace flag', () => {
    const result = decideAddMember({
      command: { userId: human.id, organizationId: orgId, role: 'owner', isPersonalOrg: true },
      user: human,
      existing: null,
      members: [],
    });
    expect(result.isOk() && result.value.isPersonalOrg).toBe(true);
  });

  it('allows the first owner on a zero-owner workspace', () => {
    const result = decideAddMember({
      command: { userId: human.id, organizationId: orgId, role: 'owner' },
      user: human,
      existing: null,
      members: [],
    });
    expect(result.isOk() && result.value.role).toBe('owner');
  });

  it('refuses a second owner', () => {
    const result = decideAddMember({
      command: { userId: human.id, organizationId: orgId, role: 'owner' },
      user: human,
      existing: null,
      members: [member({ userId: '550e8400-e29b-41d4-a716-446655440099', role: 'owner' })],
    });
    expect(result.isErr() && result.error.type).toBe('SECOND_OWNER');
  });

  it('refuses a bot admin', () => {
    const result = decideAddMember({
      command: { userId: bot.id, organizationId: orgId, role: 'admin' },
      user: bot,
      existing: null,
      members: [],
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
    });
    expect(result.isErr() && result.error.type).toBe('ALREADY_MEMBER');
  });

  it('plans the membership id and joinedAt after the decision', () => {
    const decision = decideAddMember({
      command: { userId: human.id, organizationId: orgId, role: 'member' },
      user: human,
      existing: null,
      members: [],
    });
    if (decision.isErr()) {
      throw new Error('expected a member decision');
    }
    const plan = planAddMember({
      decision: decision.value,
      membershipId: '550e8400-e29b-41d4-a716-446655440030',
      now: '2024-02-01T00:00:00.000Z',
    });
    expect(plan.kind).toBe('add-member');
    expect(plan.membership).toEqual({
      id: '550e8400-e29b-41d4-a716-446655440030',
      userId: human.id,
      organizationId: orgId,
      role: 'member',
      isPersonalOrg: false,
      joinedAt: '2024-02-01T00:00:00.000Z',
    });
  });
});

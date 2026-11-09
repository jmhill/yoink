import { describe, expect, it } from 'vitest';
import { BOT_CANNOT_BE_ADMIN_MESSAGE } from '@yoink/api-contracts';
import {
  decideCreateAdminMember,
  planCreateAdminMember,
} from './decide-create-admin-member.js';

const organization = {
  id: '550e8400-e29b-41d4-a716-446655440001',
  name: 'Polly UX',
  createdAt: '2024-06-15T12:00:00.000Z',
};
const userId = '550e8400-e29b-41d4-a716-446655440010';

describe('decideCreateAdminMember', () => {
  it('defaults a human to member and keeps the given email', () => {
    const decision = decideCreateAdminMember({
      command: { organizationId: organization.id, email: 'ada@example.com' },
      organization,
      userId,
    });
    expect(decision.isOk() && decision.value).toEqual({
      email: 'ada@example.com',
      role: 'member',
    });
  });

  it('gives an agent a reserved email and the supplied name', () => {
    const decision = decideCreateAdminMember({
      command: {
        organizationId: organization.id,
        email: 'unused@example.com',
        kind: 'agent',
        name: 'Vault bot',
      },
      organization,
      userId,
    });
    expect(decision.isOk() && decision.value.email).toBe(`agent-${userId}@yoink.invalid`);
    expect(decision.isOk() && decision.value.kind).toBe('agent');
    expect(decision.isOk() && decision.value.name).toBe('Vault bot');
    if (!decision.isOk()) return;

    const plan = planCreateAdminMember({
      decision: decision.value,
      userId,
      membershipId: '550e8400-e29b-41d4-a716-446655440011',
      organizationId: organization.id,
      now: '2024-06-15T12:00:00.000Z',
    });
    expect(plan.membership.role).toBe('member');
    expect(plan.membership.isPersonalOrg).toBe(false);
    expect(plan.user.email).toBe(`agent-${userId}@yoink.invalid`);
  });

  it('allows a human admin', () => {
    const decision = decideCreateAdminMember({
      command: {
        organizationId: organization.id,
        email: 'admin@example.com',
        role: 'admin',
      },
      organization,
      userId,
    });
    expect(decision.isOk() && decision.value.role).toBe('admin');
  });

  it('refuses an agent admin before reporting a missing workspace', () => {
    const decision = decideCreateAdminMember({
      command: {
        organizationId: organization.id,
        email: 'bot@example.com',
        kind: 'agent',
        role: 'admin',
      },
      organization: null,
      userId,
    });
    expect(decision.isErr() && decision.error.type).toBe('BOT_CANNOT_HAVE_PRIVILEGED_ROLE');
    if (decision.isErr() && decision.error.type === 'BOT_CANNOT_HAVE_PRIVILEGED_ROLE') {
      expect(decision.error.message).toBe(BOT_CANNOT_BE_ADMIN_MESSAGE);
    }
  });

  it('reports a missing workspace as the storage error the route already maps', () => {
    const decision = decideCreateAdminMember({
      command: { organizationId: organization.id, email: 'ada@example.com' },
      organization: null,
      userId,
    });
    expect(decision.isErr() && decision.error).toEqual({
      type: 'ORGANIZATION_STORAGE_ERROR',
      message: 'Organization not found',
    });
  });
});

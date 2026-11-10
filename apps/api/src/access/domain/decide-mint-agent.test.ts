import { describe, expect, it } from 'vitest';
import { agentEmailFor } from './user.js';
import {
  decideMintAgent,
  decideMintAgentCommand,
  decideMintAgentMembership,
  planMintAgent,
  type MintAgentCommand,
} from './decide-mint-agent.js';

const ORG_ID = '550e8400-e29b-41d4-a716-446655440001';
const OWNER_ID = '550e8400-e29b-41d4-a716-446655440010';
const NOW = '2024-01-15T10:00:00.000Z';

const command = (name: string, via: 'session' | 'token' = 'session'): MintAgentCommand => ({
  actor:
    via === 'session'
      ? { kind: 'user', userId: OWNER_ID, via: 'session' }
      : { kind: 'user', userId: OWNER_ID, via: 'token' },
  organizationId: ORG_ID,
  name,
});

describe('decideMintAgentCommand', () => {
  it('trims the name for a web-session person', () => {
    const decision = decideMintAgentCommand(command('  Vault bot  '));
    expect(decision.isOk() && decision.value).toEqual({
      actorUserId: OWNER_ID,
      organizationId: ORG_ID,
      name: 'Vault bot',
    });
  });

  it('refuses a bot before the blank name', () => {
    const decision = decideMintAgentCommand({
      actor: { kind: 'bot', tokenId: 'token-1', userId: OWNER_ID, name: 'Lane', via: 'token' },
      organizationId: ORG_ID,
      name: '   ',
    });
    expect(decision.isErr() && decision.error.type).toBe('BOT_CANNOT_MANAGE_TOKENS');
  });

  it('refuses a person token before the name is accepted', () => {
    const decision = decideMintAgentCommand(command('Vault bot', 'token'));
    expect(decision.isErr() && decision.error.type).toBe('BOT_CANNOT_MANAGE_TOKENS');
  });

  it('refuses a blank name', () => {
    const decision = decideMintAgentCommand(command('   '));
    expect(decision.isErr() && decision.error.type).toBe('INVALID_TOKEN_NAME');
  });
});

describe('decideMintAgentMembership', () => {
  const request = {
    actorUserId: OWNER_ID,
    organizationId: ORG_ID,
    name: 'Vault bot',
  };

  it('accepts an owner', () => {
    const decision = decideMintAgentMembership({
      request,
      membership: { role: 'owner' },
    });
    expect(decision.isOk()).toBe(true);
  });

  it('accepts an admin', () => {
    const decision = decideMintAgentMembership({
      request,
      membership: { role: 'admin' },
    });
    expect(decision.isOk()).toBe(true);
  });

  it('refuses a missing membership', () => {
    const decision = decideMintAgentMembership({
      request,
      membership: null,
    });
    expect(decision.isErr() && decision.error.type).toBe('MEMBERSHIP_NOT_FOUND');
  });

  it('refuses a member', () => {
    const decision = decideMintAgentMembership({
      request,
      membership: { role: 'member' },
    });
    expect(decision.isErr() && decision.error).toMatchObject({
      type: 'INSUFFICIENT_PERMISSIONS',
      requiredRole: 'admin',
      actualRole: 'member',
    });
  });
});

describe('decideMintAgent', () => {
  const request = {
    actorUserId: OWNER_ID,
    organizationId: ORG_ID,
    name: 'Vault bot',
  };

  it('returns the mint decision when the workspace is present', () => {
    const decision = decideMintAgent({
      request,
      organization: { id: ORG_ID },
    });
    expect(decision.isOk() && decision.value).toEqual({
      organizationId: ORG_ID,
      name: 'Vault bot',
    });
  });

  it('refuses a missing workspace', () => {
    const decision = decideMintAgent({
      request,
      organization: null,
    });
    expect(decision.isErr() && decision.error.type).toBe('ORGANIZATION_NOT_FOUND');
  });
});

describe('planMintAgent', () => {
  it('plans an agent member and a hashed token', () => {
    const userId = '550e8400-e29b-41d4-a716-446655440100';
    const plan = planMintAgent({
      decision: { organizationId: ORG_ID, name: 'Vault bot' },
      userId,
      membershipId: '550e8400-e29b-41d4-a716-446655440101',
      tokenId: '550e8400-e29b-41d4-a716-446655440102',
      tokenHash: 'fake-hash:secret',
      now: NOW,
    });

    expect(plan.kind).toBe('mint-agent');
    expect(plan.user).toEqual({
      id: userId,
      email: agentEmailFor(userId),
      name: 'Vault bot',
      kind: 'agent',
      createdAt: NOW,
    });
    expect(plan.membership).toMatchObject({
      userId,
      organizationId: ORG_ID,
      role: 'member',
      isPersonalOrg: false,
      joinedAt: NOW,
    });
    expect(plan.token).toEqual({
      id: '550e8400-e29b-41d4-a716-446655440102',
      userId,
      organizationId: ORG_ID,
      tokenHash: 'fake-hash:secret',
      name: 'Vault bot',
      createdAt: NOW,
    });
    expect(plan).not.toHaveProperty('rawToken');
  });
});

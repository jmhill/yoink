import { describe, it, expect } from 'vitest';
import { decideTransferOwnership } from './decide-transfer-ownership.js';
import type { OrganizationMembership } from './organization-membership.js';
import type { User } from './user.js';
import {
  ALREADY_OWNER_MESSAGE,
  BOT_CANNOT_TRANSFER_OWNERSHIP_MESSAGE,
  NOT_CURRENT_OWNER_MESSAGE,
  PERSONAL_WORKSPACE_TRANSFER_MESSAGE,
} from './organization-errors.js';

const orgId = '550e8400-e29b-41d4-a716-446655440001';
const now = '2024-06-15T12:00:00.000Z';
const eventId = '550e8400-e29b-41d4-a716-446655440099';

const justin: User = {
  id: '550e8400-e29b-41d4-a716-446655440010',
  email: 'justin@example.com',
  name: 'Justin',
  createdAt: '2024-01-01T00:00:00.000Z',
};

const libby: User = {
  id: '550e8400-e29b-41d4-a716-446655440012',
  email: 'libby@example.com',
  name: 'Libby',
  createdAt: '2024-01-01T00:00:00.000Z',
};

const polly: User = {
  id: '550e8400-e29b-41d4-a716-446655440014',
  email: 'polly@example.com',
  name: 'Polly',
  createdAt: '2024-01-01T00:00:00.000Z',
};

const bot: User = {
  id: '550e8400-e29b-41d4-a716-446655440013',
  email: 'agent@yoink.invalid',
  kind: 'agent',
  createdAt: '2024-01-01T00:00:00.000Z',
};

const outsider: User = {
  id: '550e8400-e29b-41d4-a716-446655440015',
  email: 'outsider@example.com',
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

const admin = membership({
  id: '550e8400-e29b-41d4-a716-446655440022',
  userId: libby.id,
  role: 'admin',
});

const member = membership({
  id: '550e8400-e29b-41d4-a716-446655440023',
  userId: polly.id,
  role: 'member',
});

const botMembership = membership({
  id: '550e8400-e29b-41d4-a716-446655440024',
  userId: bot.id,
  role: 'member',
});

const decide = (
  overrides: Partial<Parameters<typeof decideTransferOwnership>[0]> = {}
) =>
  decideTransferOwnership({
    command: { organizationId: orgId, fromUserId: justin.id, toUserId: libby.id },
    members: [owner, admin, member, botMembership],
    targetUser: libby,
    actorKind: 'human',
    eventId,
    now,
    ...overrides,
  });

describe('decideTransferOwnership', () => {
  it('hands over to an admin: old owner becomes admin, target becomes owner', () => {
    const result = decide();
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.plan.demote?.userId).toBe(justin.id);
      expect(result.value.plan.demote?.role).toBe('admin');
      expect(result.value.plan.promote.userId).toBe(libby.id);
      expect(result.value.plan.promote.role).toBe('owner');
    }
  });

  it('hands over to a member: same plan', () => {
    const result = decide({
      command: { organizationId: orgId, fromUserId: justin.id, toUserId: polly.id },
      targetUser: polly,
    });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.plan.promote.userId).toBe(polly.id);
      expect(result.value.plan.promote.role).toBe('owner');
      expect(result.value.plan.demote?.role).toBe('admin');
    }
  });

  it('records an OwnershipTransferred event with who did it', () => {
    const result = decide();
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.event).toEqual({
        type: 'OwnershipTransferred',
        id: eventId,
        organizationId: orgId,
        fromUserId: justin.id,
        toUserId: libby.id,
        actorUserId: justin.id,
        occurredAt: now,
      });
    }
  });

  it('refuses a bot caller first, even when they are not the owner', () => {
    const result = decide({ actorKind: 'agent' });
    expect(result.isErr() && result.error.type).toBe('BOT_CANNOT_TRANSFER_OWNERSHIP');
    if (result.isErr() && result.error.type === 'BOT_CANNOT_TRANSFER_OWNERSHIP') {
      expect(result.error.message).toBe(BOT_CANNOT_TRANSFER_OWNERSHIP_MESSAGE);
    }
  });

  it('refuses when fromUserId is not the current owner', () => {
    const result = decide({
      command: { organizationId: orgId, fromUserId: libby.id, toUserId: justin.id },
      targetUser: justin,
    });
    expect(result.isErr() && result.error.type).toBe('NOT_CURRENT_OWNER');
    if (result.isErr() && result.error.type === 'NOT_CURRENT_OWNER') {
      expect(result.error.message).toBe(NOT_CURRENT_OWNER_MESSAGE);
    }
  });

  it('refuses transfer on a zero-owner workspace', () => {
    const result = decide({
      members: [membership({ role: 'admin' }), admin],
    });
    expect(result.isErr() && result.error.type).toBe('NOT_CURRENT_OWNER');
  });

  it('refuses a personal workspace after the owner check, before already-owner', () => {
    const result = decide({
      command: { organizationId: orgId, fromUserId: justin.id, toUserId: justin.id },
      members: [{ ...owner, isPersonalOrg: true }],
      targetUser: justin,
    });
    expect(result.isErr() && result.error.type).toBe('PERSONAL_WORKSPACE_TRANSFER');
    if (result.isErr() && result.error.type === 'PERSONAL_WORKSPACE_TRANSFER') {
      expect(result.error.message).toBe(PERSONAL_WORKSPACE_TRANSFER_MESSAGE);
    }
  });

  it('refuses handing over to yourself', () => {
    const result = decide({
      command: { organizationId: orgId, fromUserId: justin.id, toUserId: justin.id },
      targetUser: justin,
    });
    expect(result.isErr() && result.error.type).toBe('ALREADY_OWNER');
    if (result.isErr() && result.error.type === 'ALREADY_OWNER') {
      expect(result.error.message).toBe(ALREADY_OWNER_MESSAGE);
    }
  });

  it('refuses a missing user after the already-owner check', () => {
    const result = decide({
      command: { organizationId: orgId, fromUserId: justin.id, toUserId: outsider.id },
      targetUser: null,
    });
    expect(result.isErr() && result.error.type).toBe('USER_NOT_FOUND');
  });

  it('refuses transferring to a bot', () => {
    const result = decide({
      command: { organizationId: orgId, fromUserId: justin.id, toUserId: bot.id },
      targetUser: bot,
    });
    expect(result.isErr() && result.error.type).toBe('BOT_CANNOT_HAVE_PRIVILEGED_ROLE');
  });

  it('refuses someone outside the workspace', () => {
    const result = decide({
      command: { organizationId: orgId, fromUserId: justin.id, toUserId: outsider.id },
      targetUser: outsider,
    });
    expect(result.isErr() && result.error.type).toBe('TARGET_NOT_WORKSPACE_MEMBER');
  });

  it('checks refusals in the specified order when several could apply', () => {
    const botOnPersonal = decide({
      actorKind: 'agent',
      command: { organizationId: orgId, fromUserId: justin.id, toUserId: justin.id },
      members: [{ ...owner, isPersonalOrg: true }],
      targetUser: justin,
    });
    expect(botOnPersonal.isErr() && botOnPersonal.error.type).toBe(
      'BOT_CANNOT_TRANSFER_OWNERSHIP'
    );

    const adminOnPersonal = decide({
      command: { organizationId: orgId, fromUserId: libby.id, toUserId: justin.id },
      members: [{ ...owner, isPersonalOrg: true }, { ...admin, isPersonalOrg: true }],
      targetUser: justin,
    });
    expect(adminOnPersonal.isErr() && adminOnPersonal.error.type).toBe('NOT_CURRENT_OWNER');
  });
});

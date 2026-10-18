import { describe, it, expect } from 'vitest';
import {
  BOT_CANNOT_BE_OWNER_MESSAGE,
  TARGET_NOT_WORKSPACE_MEMBER_MESSAGE,
} from '@yoink/api-contracts';
import { decideSetOwner } from './decide-set-owner.js';
import type { OrganizationMembership } from './organization-membership.js';
import type { Invitation } from './invitation.js';
import type { User } from './user.js';

const orgId = '550e8400-e29b-41d4-a716-446655440001';
const eventId = '550e8400-e29b-41d4-a716-446655440099';
const now = '2024-06-15T12:00:00.000Z';

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

const pendingInvite = (overrides: Partial<Invitation> = {}): Invitation => ({
  id: '550e8400-e29b-41d4-a716-446655440030',
  code: 'OWNER001',
  email: 'libby@example.com',
  organizationId: orgId,
  invitedByUserId: null,
  role: 'owner',
  expiresAt: '2024-06-22T12:00:00.000Z',
  acceptedAt: null,
  acceptedByUserId: null,
  replacedAt: null,
  createdAt: '2024-06-15T12:00:00.000Z',
  ...overrides,
});

const decide = (input: {
  members: readonly OrganizationMembership[];
  targetUser: User | null;
  userId?: string;
  pendingOwnerInvitation?: Invitation | null;
}) =>
  decideSetOwner({
    command: { organizationId: orgId, userId: input.userId ?? human.id },
    members: input.members,
    targetUser: input.targetUser,
    pendingOwnerInvitation: input.pendingOwnerInvitation ?? null,
    eventId,
    now,
  });

describe('decideSetOwner', () => {
  it('promotes a human member on a zero-owner workspace', () => {
    const target = membership({ role: 'member' });
    const result = decide({ members: [target], targetUser: human });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.plan.demote).toBeNull();
      expect(result.value.plan.promote.role).toBe('owner');
      expect(result.value.plan.promote.userId).toBe(human.id);
      expect(result.value.event.type).toBe('OwnerAssigned');
      expect(result.value.event.actor).toEqual({ kind: 'app-admin' });
      expect(result.value.event.fromRole).toBe('member');
      expect(result.value.event.previousOwnerUserId).toBeNull();
      expect(result.value.replaced).toBeNull();
    }
  });

  it('demotes the old owner to admin in the same plan and records previousOwnerUserId', () => {
    const target = membership({ role: 'admin' });
    const result = decide({ members: [currentOwner, target], targetUser: human });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.plan.demote?.id).toBe(currentOwner.id);
      expect(result.value.plan.demote?.role).toBe('admin');
      expect(result.value.plan.promote.role).toBe('owner');
      expect(result.value.event.fromRole).toBe('admin');
      expect(result.value.event.previousOwnerUserId).toBe(currentOwner.userId);
      expect(result.value.event.actor).toEqual({ kind: 'app-admin' });
    }
  });

  it('marks a pending owner invitation replaced', () => {
    const target = membership({ role: 'member' });
    const invite = pendingInvite();
    const result = decide({
      members: [target],
      targetUser: human,
      pendingOwnerInvitation: invite,
    });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.replaced?.id).toBe(invite.id);
      expect(result.value.replaced?.replacedAt).toBe(now);
    }
  });

  it('is a no-op when the target is already the owner', () => {
    const result = decide({
      members: [currentOwner],
      targetUser: { ...human, id: currentOwner.userId },
      userId: currentOwner.userId,
    });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.plan.demote).toBeNull();
      expect(result.value.plan.promote.role).toBe('owner');
      expect(result.value.event.fromRole).toBeNull();
      expect(result.value.event.previousOwnerUserId).toBeNull();
    }
  });

  it('refuses a missing user', () => {
    const result = decide({ members: [], targetUser: null });
    expect(result.isErr() && result.error.type).toBe('USER_NOT_FOUND');
  });

  it('refuses a non-member', () => {
    const result = decide({ members: [], targetUser: human });
    expect(result.isErr() && result.error.type).toBe('TARGET_NOT_WORKSPACE_MEMBER');
    if (result.isErr() && result.error.type === 'TARGET_NOT_WORKSPACE_MEMBER') {
      expect(result.error.message).toBe(TARGET_NOT_WORKSPACE_MEMBER_MESSAGE);
    }
  });

  it('refuses a bot', () => {
    const botMembership = membership({ userId: bot.id, role: 'member' });
    const result = decide({
      members: [botMembership],
      targetUser: bot,
      userId: bot.id,
    });
    expect(result.isErr() && result.error.type).toBe('BOT_CANNOT_HAVE_PRIVILEGED_ROLE');
    if (result.isErr() && result.error.type === 'BOT_CANNOT_HAVE_PRIVILEGED_ROLE') {
      expect(result.error.message).toBe(BOT_CANNOT_BE_OWNER_MESSAGE);
    }
  });
});

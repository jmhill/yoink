import { describe, it, expect } from 'vitest';
import { BOT_CANNOT_BE_OWNER_MESSAGE } from '@yoink/api-contracts';
import { decideCreateWorkspace } from './decide-create-workspace.js';
import type { User } from './user.js';

const now = '2024-06-15T12:00:00.000Z';
const ids = {
  organizationId: '550e8400-e29b-41d4-a716-446655440001',
  membershipId: '550e8400-e29b-41d4-a716-446655440002',
  invitationId: '550e8400-e29b-41d4-a716-446655440003',
  eventId: '550e8400-e29b-41d4-a716-446655440004',
  code: 'GARDEN01',
};

const justin: User = {
  id: '550e8400-e29b-41d4-a716-446655440010',
  email: 'justin@example.com',
  name: 'Justin',
  createdAt: '2024-01-01T00:00:00.000Z',
};

const bot: User = {
  id: '550e8400-e29b-41d4-a716-446655440011',
  email: 'agent-550e8400-e29b-41d4-a716-446655440011@yoink.invalid',
  kind: 'agent',
  createdAt: '2024-01-01T00:00:00.000Z',
};

describe('decideCreateWorkspace', () => {
  it('assigns an existing human as owner with OwnerAssigned app-admin', () => {
    const result = decideCreateWorkspace({
      command: { name: 'Garden Club', ownerEmail: 'justin@example.com' },
      ownerAccount: justin,
      ids,
      now,
    });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.kind).toBe('owner-assigned');
      if (result.value.kind === 'owner-assigned') {
        expect(result.value.organization.name).toBe('Garden Club');
        expect(result.value.membership.role).toBe('owner');
        expect(result.value.membership.isPersonalOrg).toBe(false);
        expect(result.value.membership.userId).toBe(justin.id);
        expect(result.value.event).toEqual({
          type: 'OwnerAssigned',
          id: ids.eventId,
          organizationId: ids.organizationId,
          userId: justin.id,
          fromRole: null,
          previousOwnerUserId: null,
          actor: { kind: 'app-admin' },
          occurredAt: now,
        });
      }
    }
  });

  it('matches a mixed-case spaced email to the existing account', () => {
    const result = decideCreateWorkspace({
      command: { name: 'Garden Club', ownerEmail: '  Justin@Example.COM  ' },
      ownerAccount: justin,
      ids,
      now,
    });
    expect(result.isOk() && result.value.kind).toBe('owner-assigned');
  });

  it('issues an owner invite for a new email', () => {
    const result = decideCreateWorkspace({
      command: { name: 'Garden Club', ownerEmail: '  Libby@Example.COM  ' },
      ownerAccount: null,
      ids,
      now,
    });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.kind).toBe('owner-invited');
      if (result.value.kind === 'owner-invited') {
        expect(result.value.invitation.role).toBe('owner');
        expect(result.value.invitation.email).toBe('libby@example.com');
        expect(result.value.invitation.invitedByUserId).toBeNull();
        expect(result.value.invitation.expiresAt).toBe('2024-06-22T12:00:00.000Z');
        expect(result.value.invitation.replacedAt).toBeNull();
      }
    }
  });

  it('refuses a bot email', () => {
    const result = decideCreateWorkspace({
      command: { name: 'Garden Club', ownerEmail: bot.email },
      ownerAccount: bot,
      ids,
      now,
    });
    expect(result.isErr() && result.error.type).toBe('BOT_CANNOT_HAVE_PRIVILEGED_ROLE');
    if (result.isErr() && result.error.type === 'BOT_CANNOT_HAVE_PRIVILEGED_ROLE') {
      expect(result.error.message).toBe(BOT_CANNOT_BE_OWNER_MESSAGE);
      expect(result.error.role).toBe('owner');
    }
  });
});

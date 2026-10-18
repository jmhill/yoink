import { describe, it, expect } from 'vitest';
import { decideRemoveMember } from './decide-remove-member.js';
import {
  OWNER_MUST_TRANSFER_MESSAGE,
  THE_OWNER_CANT_BE_REMOVED_MESSAGE,
} from './organization-errors.js';
import type { OrganizationMembership } from './organization-membership.js';
import type { RemoveMember } from './membership-commands.js';

const orgId = '550e8400-e29b-41d4-a716-446655440001';
const eventId = '550e8400-e29b-41d4-a716-446655440099';
const now = '2024-06-15T12:00:00.000Z';

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

const otherAdmin = member({
  id: '550e8400-e29b-41d4-a716-446655440023',
  userId: '550e8400-e29b-41d4-a716-446655440013',
  role: 'admin',
});

const decide = (command: RemoveMember, members: readonly OrganizationMembership[]) =>
  decideRemoveMember({ command, members, eventId, now });

describe('decideRemoveMember', () => {
  it('lets an admin remove another admin and records MemberRemoved', () => {
    const result = decide(
      {
        organizationId: orgId,
        userId: otherAdmin.userId,
        by: { kind: 'member', userId: admin.userId },
      },
      [owner, admin, otherAdmin]
    );
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.event).toEqual({
        type: 'MemberRemoved',
        id: eventId,
        organizationId: orgId,
        userId: otherAdmin.userId,
        role: 'admin',
        actorUserId: admin.userId,
        occurredAt: now,
      });
    }
  });

  it('lets an admin remove a member', () => {
    const result = decide(
      {
        organizationId: orgId,
        userId: member().userId,
        by: { kind: 'member', userId: admin.userId },
      },
      [owner, admin, member()]
    );
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.event.type).toBe('MemberRemoved');
    }
  });

  it('refuses a member removing anyone with REMOVE_NOT_ALLOWED', () => {
    const other = member({
      id: 'other',
      userId: '550e8400-e29b-41d4-a716-446655440099',
    });
    const result = decide(
      {
        organizationId: orgId,
        userId: other.userId,
        by: { kind: 'member', userId: member().userId },
      },
      [owner, member(), other]
    );
    expect(result.isErr() && result.error.type).toBe('REMOVE_NOT_ALLOWED');
  });

  it('refuses a member remover targeting self with CANNOT_REMOVE_SELF', () => {
    const result = decide(
      {
        organizationId: orgId,
        userId: member().userId,
        by: { kind: 'member', userId: member().userId },
      },
      [owner, member()]
    );
    expect(result.isErr() && result.error.type).toBe('CANNOT_REMOVE_SELF');
  });

  it('refuses an admin removing the owner with The owner can\'t be removed and no handover path', () => {
    const result = decide(
      {
        organizationId: orgId,
        userId: owner.userId,
        by: { kind: 'member', userId: admin.userId },
      },
      [owner, admin]
    );
    expect(result.isErr() && result.error.type).toBe('OWNER_CANNOT_BE_REMOVED');
    if (result.isErr() && result.error.type === 'OWNER_CANNOT_BE_REMOVED') {
      expect(result.error.message).toBe(THE_OWNER_CANT_BE_REMOVED_MESSAGE);
      expect(result.error).not.toHaveProperty('handoverPath');
    }
  });

  it('refuses a member removing the owner with The owner can\'t be removed', () => {
    const result = decide(
      {
        organizationId: orgId,
        userId: owner.userId,
        by: { kind: 'member', userId: member().userId },
      },
      [owner, member()]
    );
    expect(result.isErr() && result.error.type).toBe('OWNER_CANNOT_BE_REMOVED');
    if (result.isErr() && result.error.type === 'OWNER_CANNOT_BE_REMOVED') {
      expect(result.error.message).toBe(THE_OWNER_CANT_BE_REMOVED_MESSAGE);
    }
  });

  it('refuses the owner leaving with Hand over ownership first', () => {
    const result = decide(
      {
        organizationId: orgId,
        userId: owner.userId,
        by: { kind: 'self' },
      },
      [owner, admin]
    );
    expect(result.isErr() && result.error.type).toBe('OWNER_MUST_TRANSFER');
    if (result.isErr() && result.error.type === 'OWNER_MUST_TRANSFER') {
      expect(result.error.message).toBe(OWNER_MUST_TRANSFER_MESSAGE);
    }
  });

  it('records MemberLeft when a person leaves', () => {
    const result = decide(
      {
        organizationId: orgId,
        userId: admin.userId,
        by: { kind: 'self' },
      },
      [owner, admin]
    );
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.event).toEqual({
        type: 'MemberLeft',
        id: eventId,
        organizationId: orgId,
        userId: admin.userId,
        role: 'admin',
        occurredAt: now,
      });
    }
  });

  it('refuses leaving a personal workspace', () => {
    const personal = member({ isPersonalOrg: true, role: 'owner' });
    const result = decide(
      {
        organizationId: orgId,
        userId: personal.userId,
        by: { kind: 'self' },
      },
      [personal]
    );
    expect(result.isErr() && result.error.type).toBe('CANNOT_LEAVE_PERSONAL_ORG');
  });

  it('refuses removing the last admin of an ownerless workspace', () => {
    const result = decide(
      {
        organizationId: orgId,
        userId: admin.userId,
        by: { kind: 'self' },
      },
      [admin, member()]
    );
    expect(result.isErr() && result.error.type).toBe('LAST_ADMIN');
  });

  it('allows the last admin to leave when an owner remains', () => {
    const result = decide(
      {
        organizationId: orgId,
        userId: admin.userId,
        by: { kind: 'self' },
      },
      [owner, admin]
    );
    expect(result.isOk()).toBe(true);
  });
});

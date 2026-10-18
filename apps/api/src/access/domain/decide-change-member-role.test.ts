import { describe, it, expect } from 'vitest';
import { decideChangeMemberRole } from './decide-change-member-role.js';
import type { ChangeMemberRole, RoleChanger } from './membership-commands.js';
import {
  BOT_CANNOT_BE_ADMIN_MESSAGE,
  OWNER_MUST_TRANSFER_MAKE_OWNER_MESSAGE,
} from './organization-errors.js';
import type { OrganizationMembership } from './organization-membership.js';

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

const sessionMember = (userId: string): RoleChanger => ({
  kind: 'member',
  userId,
  via: 'session',
  principalKind: 'human',
});

const command = (
  overrides: Partial<ChangeMemberRole> & Pick<ChangeMemberRole, 'userId' | 'newRole' | 'by'>
): ChangeMemberRole => ({
  organizationId: orgId,
  ...overrides,
});

const decide = (
  input: Partial<Parameters<typeof decideChangeMemberRole>[0]> & {
    command: ChangeMemberRole;
    members: readonly OrganizationMembership[];
  }
) =>
  decideChangeMemberRole({
    targetKind: 'human',
    eventId,
    now,
    ...input,
  });

describe('decideChangeMemberRole', () => {
  it('lets the owner promote a member', () => {
    const result = decide({
      command: command({
        userId: member().userId,
        newRole: 'admin',
        by: sessionMember(owner.userId),
      }),
      members: [owner, member()],
    });
    expect(result.isOk()).toBe(true);
    if (result.isOk() && result.value.kind === 'changed') {
      expect(result.value.membership.role).toBe('admin');
      expect(result.value.event).toEqual({
        type: 'MemberRoleChanged',
        id: eventId,
        organizationId: orgId,
        userId: member().userId,
        fromRole: 'member',
        toRole: 'admin',
        actor: { kind: 'member', userId: owner.userId },
        occurredAt: now,
      });
    } else {
      expect(result.isOk() && result.value.kind).toBe('changed');
    }
  });

  it('lets an admin promote a member', () => {
    const result = decide({
      command: command({
        userId: member().userId,
        newRole: 'admin',
        by: sessionMember(admin.userId),
      }),
      members: [owner, admin, member()],
    });
    expect(result.isOk() && result.value.kind).toBe('changed');
    if (result.isOk() && result.value.kind === 'changed') {
      expect(result.value.membership.role).toBe('admin');
      expect(result.value.event.actor).toEqual({ kind: 'member', userId: admin.userId });
    }
  });

  it('lets an admin demote an admin', () => {
    const result = decide({
      command: command({
        userId: otherAdmin.userId,
        newRole: 'member',
        by: sessionMember(admin.userId),
      }),
      members: [owner, admin, otherAdmin],
    });
    expect(result.isOk() && result.value.kind).toBe('changed');
    if (result.isOk() && result.value.kind === 'changed') {
      expect(result.value.membership.role).toBe('member');
      expect(result.value.event.fromRole).toBe('admin');
      expect(result.value.event.toRole).toBe('member');
    }
  });

  it('lets the owner demote an admin', () => {
    const result = decide({
      command: command({
        userId: admin.userId,
        newRole: 'member',
        by: sessionMember(owner.userId),
      }),
      members: [owner, admin],
    });
    expect(result.isOk() && result.value.kind).toBe('changed');
  });

  it('refuses a bot caller targeting the owner with BOT_CANNOT_CHANGE_ROLES first', () => {
    const result = decide({
      command: command({
        userId: owner.userId,
        newRole: 'admin',
        by: {
          kind: 'member',
          userId: member().userId,
          via: 'token',
          principalKind: 'agent',
        },
      }),
      members: [owner, member()],
    });
    expect(result.isErr() && result.error.type).toBe('BOT_CANNOT_CHANGE_ROLES');
  });

  it('refuses a human token caller with BOT_CANNOT_CHANGE_ROLES', () => {
    const result = decide({
      command: command({
        userId: member().userId,
        newRole: 'admin',
        by: {
          kind: 'member',
          userId: owner.userId,
          via: 'token',
          principalKind: 'human',
        },
      }),
      members: [owner, member()],
    });
    expect(result.isErr() && result.error.type).toBe('BOT_CANNOT_CHANGE_ROLES');
  });

  it('refuses a member targeting the owner with ROLE_CHANGE_NOT_ALLOWED', () => {
    const result = decide({
      command: command({
        userId: owner.userId,
        newRole: 'admin',
        by: sessionMember(member().userId),
      }),
      members: [owner, member()],
    });
    expect(result.isErr() && result.error.type).toBe('ROLE_CHANGE_NOT_ALLOWED');
  });

  it('refuses the owner targeting self with CANNOT_CHANGE_OWN_ROLE', () => {
    const result = decide({
      command: command({
        userId: owner.userId,
        newRole: 'admin',
        by: sessionMember(owner.userId),
      }),
      members: [owner, admin],
    });
    expect(result.isErr() && result.error.type).toBe('CANNOT_CHANGE_OWN_ROLE');
  });

  it('refuses an admin targeting self with CANNOT_CHANGE_OWN_ROLE', () => {
    const result = decide({
      command: command({
        userId: admin.userId,
        newRole: 'member',
        by: sessionMember(admin.userId),
      }),
      members: [owner, admin],
    });
    expect(result.isErr() && result.error.type).toBe('CANNOT_CHANGE_OWN_ROLE');
  });

  it('refuses an admin targeting the owner with OWNER_ROLE_LOCKED', () => {
    const result = decide({
      command: command({
        userId: owner.userId,
        newRole: 'admin',
        by: sessionMember(admin.userId),
      }),
      members: [owner, admin],
    });
    expect(result.isErr() && result.error.type).toBe('OWNER_ROLE_LOCKED');
  });

  it('refuses an admin promoting a bot with BOT_CANNOT_HAVE_PRIVILEGED_ROLE', () => {
    const bot = member({ role: 'member' });
    const result = decide({
      command: command({
        userId: bot.userId,
        newRole: 'admin',
        by: sessionMember(admin.userId),
      }),
      members: [owner, admin, bot],
      targetKind: 'agent',
    });
    expect(result.isErr() && result.error.type).toBe('BOT_CANNOT_HAVE_PRIVILEGED_ROLE');
    if (result.isErr() && result.error.type === 'BOT_CANNOT_HAVE_PRIVILEGED_ROLE') {
      expect(result.error.message).toBe(BOT_CANNOT_BE_ADMIN_MESSAGE);
    }
  });

  it('returns unchanged with no event when the role is already the requested one', () => {
    const result = decide({
      command: command({
        userId: member().userId,
        newRole: 'member',
        by: sessionMember(admin.userId),
      }),
      members: [owner, admin, member()],
    });
    expect(result.isOk() && result.value.kind).toBe('unchanged');
    if (result.isOk() && result.value.kind === 'unchanged') {
      expect(result.value.membership.role).toBe('member');
    }
  });

  it('refuses assigning owner', () => {
    const result = decide({
      command: command({
        userId: member().userId,
        newRole: 'owner',
        by: sessionMember(admin.userId),
      }),
      members: [owner, admin, member()],
    });
    expect(result.isErr() && result.error.type).toBe('CANNOT_ASSIGN_OWNER_ROLE');
  });

  it('refuses demoting the last admin of an ownerless workspace', () => {
    const result = decide({
      command: command({
        userId: admin.userId,
        newRole: 'member',
        by: { kind: 'app-admin' },
      }),
      members: [admin, member()],
    });
    expect(result.isErr() && result.error.type).toBe('LAST_ADMIN');
  });

  it('lets an app-admin change a member and records actor.kind app-admin', () => {
    const result = decide({
      command: command({
        userId: member().userId,
        newRole: 'admin',
        by: { kind: 'app-admin' },
      }),
      members: [owner, member()],
    });
    expect(result.isOk() && result.value.kind).toBe('changed');
    if (result.isOk() && result.value.kind === 'changed') {
      expect(result.value.event.actor).toEqual({ kind: 'app-admin' });
    }
  });

  it('lets an app-admin change the owner only via OWNER_MUST_TRANSFER with the admin-panel text', () => {
    const result = decide({
      command: command({
        userId: owner.userId,
        newRole: 'admin',
        by: { kind: 'app-admin' },
      }),
      members: [owner, admin],
    });
    expect(result.isErr() && result.error.type).toBe('OWNER_MUST_TRANSFER');
    if (result.isErr() && result.error.type === 'OWNER_MUST_TRANSFER') {
      expect(result.error.message).toBe(OWNER_MUST_TRANSFER_MAKE_OWNER_MESSAGE);
    }
  });

  it('records nothing when an app-admin sets the role someone already has', () => {
    const result = decide({
      command: command({
        userId: admin.userId,
        newRole: 'admin',
        by: { kind: 'app-admin' },
      }),
      members: [owner, admin],
    });
    expect(result.isOk() && result.value.kind).toBe('unchanged');
  });
});

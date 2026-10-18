import { describe, it, expect } from 'vitest';
import {
  BOT_CANNOT_BE_OWNER_MESSAGE,
  PERSONAL_WORKSPACE_OWNER_INVITE_MESSAGE,
  WORKSPACE_ALREADY_HAS_OWNER_MESSAGE,
} from '@yoink/api-contracts';
import { decideIssueOwnerInvitation } from './decide-issue-owner-invitation.js';
import type { Organization } from './organization.js';
import type { OrganizationMembership } from './organization-membership.js';
import type { Invitation } from './invitation.js';
import type { User } from './user.js';

const now = '2024-06-15T12:00:00.000Z';
const org: Organization = {
  id: '550e8400-e29b-41d4-a716-446655440001',
  name: 'Garden Club',
  createdAt: '2024-01-01T00:00:00.000Z',
};

const ids = {
  membershipId: '550e8400-e29b-41d4-a716-446655440002',
  invitationId: '550e8400-e29b-41d4-a716-446655440003',
  eventId: '550e8400-e29b-41d4-a716-446655440004',
  code: 'GARDEN02',
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

const member = (overrides: Partial<OrganizationMembership> = {}): OrganizationMembership => ({
  id: '550e8400-e29b-41d4-a716-446655440020',
  userId: justin.id,
  organizationId: org.id,
  role: 'member',
  isPersonalOrg: false,
  joinedAt: '2024-01-01T00:00:00.000Z',
  ...overrides,
});

const pending = (overrides: Partial<Invitation> = {}): Invitation => ({
  id: '550e8400-e29b-41d4-a716-446655440030',
  code: 'OWNER001',
  email: 'libby@example.com',
  organizationId: org.id,
  invitedByUserId: null,
  role: 'owner',
  expiresAt: '2024-06-22T12:00:00.000Z',
  acceptedAt: null,
  acceptedByUserId: null,
  replacedAt: null,
  createdAt: '2024-06-08T12:00:00.000Z',
  ...overrides,
});

const decide = (input: {
  email?: string;
  members?: readonly OrganizationMembership[];
  pendingOwnerInvitation?: Invitation | null;
  account?: User | null;
}) =>
  decideIssueOwnerInvitation({
    command: { organizationId: org.id, email: input.email ?? 'libby@example.com' },
    organization: org,
    members: input.members ?? [],
    pendingOwnerInvitation: input.pendingOwnerInvitation ?? null,
    account: input.account === undefined ? null : input.account,
    ids,
    now,
  });

describe('decideIssueOwnerInvitation', () => {
  it('replaces a pending invite with the same email (New link)', () => {
    const old = pending();
    const result = decide({
      email: 'libby@example.com',
      pendingOwnerInvitation: old,
    });
    expect(result.isOk()).toBe(true);
    if (result.isOk() && result.value.kind === 'owner-invited') {
      expect(result.value.replaced?.id).toBe(old.id);
      expect(result.value.replaced?.replacedAt).toBe(now);
      expect(result.value.invitation.email).toBe('libby@example.com');
      expect(result.value.invitation.code).toBe(ids.code);
      expect(result.value.invitation.id).toBe(ids.invitationId);
    }
  });

  it('replaces a pending invite with a different email', () => {
    const old = pending();
    const result = decide({
      email: '  Polly@Example.COM  ',
      pendingOwnerInvitation: old,
    });
    expect(result.isOk()).toBe(true);
    if (result.isOk() && result.value.kind === 'owner-invited') {
      expect(result.value.replaced?.id).toBe(old.id);
      expect(result.value.invitation.email).toBe('polly@example.com');
    }
  });

  it('assigns an existing account as owner and marks the invite replaced', () => {
    const old = pending();
    const result = decide({
      email: 'justin@example.com',
      pendingOwnerInvitation: old,
      account: justin,
    });
    expect(result.isOk()).toBe(true);
    if (result.isOk() && result.value.kind === 'owner-assigned') {
      expect(result.value.replaced?.id).toBe(old.id);
      expect(result.value.plan.kind).toBe('add');
      expect(result.value.event.actor).toEqual({ kind: 'app-admin' });
      expect(result.value.event.fromRole).toBeNull();
      expect(result.value.event.userId).toBe(justin.id);
    }
  });

  it('promotes an existing member', () => {
    const result = decide({
      email: 'justin@example.com',
      members: [member({ role: 'admin' })],
      account: justin,
    });
    expect(result.isOk()).toBe(true);
    if (result.isOk() && result.value.kind === 'owner-assigned') {
      expect(result.value.plan.kind).toBe('promote');
      expect(result.value.event.fromRole).toBe('admin');
    }
  });

  it('refuses a personal workspace first', () => {
    const result = decide({
      members: [member({ isPersonalOrg: true, role: 'owner' })],
      account: justin,
    });
    expect(result.isErr() && result.error.type).toBe(
      'PERSONAL_WORKSPACE_OWNER_INVITATION'
    );
    if (result.isErr() && result.error.type === 'PERSONAL_WORKSPACE_OWNER_INVITATION') {
      expect(result.error.message).toBe(PERSONAL_WORKSPACE_OWNER_INVITE_MESSAGE);
    }
  });

  it('refuses a workspace that already has an owner before looking up the account', () => {
    const result = decide({
      members: [member({ role: 'owner' })],
      account: bot,
    });
    expect(result.isErr() && result.error.type).toBe('WORKSPACE_ALREADY_HAS_OWNER');
    if (result.isErr() && result.error.type === 'WORKSPACE_ALREADY_HAS_OWNER') {
      expect(result.error.message).toBe(WORKSPACE_ALREADY_HAS_OWNER_MESSAGE);
    }
  });

  it('refuses a bot email', () => {
    const result = decide({ email: bot.email, account: bot });
    expect(result.isErr() && result.error.type).toBe('BOT_CANNOT_HAVE_PRIVILEGED_ROLE');
    if (result.isErr() && result.error.type === 'BOT_CANNOT_HAVE_PRIVILEGED_ROLE') {
      expect(result.error.message).toBe(BOT_CANNOT_BE_OWNER_MESSAGE);
    }
  });
});

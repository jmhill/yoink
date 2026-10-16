import { describe, it, expect } from 'vitest';
import {
  decideOwnerRemains,
  membershipsWithRole,
  membershipsWithout,
  ownerOf,
  planOwnershipTransfer,
} from './owner-presence.js';
import type { OrganizationMembership } from './organization-membership.js';

const orgId = '550e8400-e29b-41d4-a716-446655440001';

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

describe('decideOwnerRemains', () => {
  it('allows any change on a zero-owner workspace', () => {
    const current = [admin, member()];
    expect(decideOwnerRemains(current, membershipsWithout(current, admin.userId)).isOk()).toBe(
      true
    );
  });

  it('allows removing a non-owner when an owner remains', () => {
    const current = [owner, admin];
    expect(decideOwnerRemains(current, membershipsWithout(current, admin.userId)).isOk()).toBe(
      true
    );
  });

  it('refuses removing the owner (would leave the workspace ownerless)', () => {
    const current = [owner, admin];
    const result = decideOwnerRemains(current, membershipsWithout(current, owner.userId));
    expect(result.isErr() && result.error.type).toBe('OWNER_MUST_TRANSFER');
  });

  it('refuses demoting the owner without naming a new one', () => {
    const current = [owner, admin];
    const result = decideOwnerRemains(current, membershipsWithRole(current, owner.userId, 'admin'));
    expect(result.isErr() && result.error.type).toBe('OWNER_MUST_TRANSFER');
  });

  it('allows transferring: old owner becomes admin and a new owner is named', () => {
    const current = [owner, admin];
    const next = membershipsWithRole(
      membershipsWithRole(current, owner.userId, 'admin'),
      admin.userId,
      'owner'
    );
    expect(decideOwnerRemains(current, next).isOk()).toBe(true);
    expect(ownerOf(next)?.userId).toBe(admin.userId);
  });
});

describe('planOwnershipTransfer', () => {
  it('promotes on a zero-owner workspace with no demote', () => {
    const incoming = member();
    const plan = planOwnershipTransfer([incoming, admin], incoming);
    expect(plan.demote).toBeNull();
    expect(plan.promote.role).toBe('owner');
    expect(plan.promote.userId).toBe(incoming.userId);
  });

  it('demotes the current owner to admin in the same plan', () => {
    const incoming = admin;
    const plan = planOwnershipTransfer([owner, incoming], incoming);
    expect(plan.demote?.id).toBe(owner.id);
    expect(plan.demote?.role).toBe('admin');
    expect(plan.promote.role).toBe('owner');
    expect(plan.promote.userId).toBe(incoming.userId);
  });

  it('is a no-op demote when the target is already owner', () => {
    const plan = planOwnershipTransfer([owner, admin], owner);
    expect(plan.demote).toBeNull();
    expect(plan.promote).toBe(owner);
  });
});

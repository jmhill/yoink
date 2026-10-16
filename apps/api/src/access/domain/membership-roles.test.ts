import { describe, it, expect } from 'vitest';
import { lastAdminBlocksChange } from './membership-roles.js';
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

describe('lastAdminBlocksChange', () => {
  it('blocks removing or demoting the last admin of an ownerless workspace', () => {
    expect(lastAdminBlocksChange(admin, [admin, member()])).toBe(true);
  });

  it('does not block the last admin when an owner is present', () => {
    expect(lastAdminBlocksChange(admin, [owner, admin])).toBe(false);
  });

  it('does not block a member', () => {
    expect(lastAdminBlocksChange(member(), [admin, member()])).toBe(false);
  });

  it('does not block a second admin of an ownerless workspace', () => {
    const otherAdmin = member({
      id: 'admin-2',
      userId: '550e8400-e29b-41d4-a716-446655440098',
      role: 'admin',
    });
    expect(lastAdminBlocksChange(admin, [admin, otherAdmin])).toBe(false);
  });
});

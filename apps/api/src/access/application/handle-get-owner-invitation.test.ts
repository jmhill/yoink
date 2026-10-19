import { describe, it, expect } from 'vitest';
import { handleGetOwnerInvitation } from './handle-get-owner-invitation.js';
import { createFakeOrganizationStore } from '../infrastructure/fake-organization-store.js';
import { createFakeOrganizationMembershipStore } from '../infrastructure/fake-organization-membership-store.js';
import { createFakeInvitationStore } from '../infrastructure/fake-invitation-store.js';
import type { Organization } from '../domain/organization.js';
import type { Invitation } from '../domain/invitation.js';

const now = '2024-06-15T12:00:00.000Z';
const org: Organization = {
  id: '550e8400-e29b-41d4-a716-446655440001',
  name: 'Garden Club',
  createdAt: '2024-01-01T00:00:00.000Z',
};
const invitation: Invitation = {
  id: '550e8400-e29b-41d4-a716-446655440030',
  code: 'GARDEN01',
  email: 'libby@example.com',
  organizationId: org.id,
  invitedByUserId: null,
  role: 'owner',
  expiresAt: '2024-06-22T12:00:00.000Z',
  acceptedAt: null,
  acceptedByUserId: null,
  replacedAt: null,
  createdAt: now,
};

describe('handleGetOwnerInvitation', () => {
  it('returns a pending owner invitation', async () => {
    const organizationStore = createFakeOrganizationStore({ initialOrganizations: [org] });
    const invitationStore = createFakeInvitationStore({ initialInvitations: [invitation] });
    const result = await handleGetOwnerInvitation(org.id, {
      organizationStore,
      membershipStore: createFakeOrganizationMembershipStore(),
      invitationStore,
      now: () => now,
    });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.ownerInvitation?.email).toBe('libby@example.com');
      expect(result.value.expiredOwnerInvitation).toBeNull();
    }
  });

  it('returns expiredOwnerInvitation when the live invite has expired', async () => {
    const organizationStore = createFakeOrganizationStore({ initialOrganizations: [org] });
    const invitationStore = createFakeInvitationStore({
      initialInvitations: [{ ...invitation, expiresAt: '2024-06-15T12:00:00.000Z' }],
    });
    const result = await handleGetOwnerInvitation(org.id, {
      organizationStore,
      membershipStore: createFakeOrganizationMembershipStore(),
      invitationStore,
      now: () => now,
    });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.ownerInvitation).toBeNull();
      expect(result.value.expiredOwnerInvitation).toEqual({
        email: 'libby@example.com',
        expiredAt: '2024-06-15T12:00:00.000Z',
      });
    }
  });
});

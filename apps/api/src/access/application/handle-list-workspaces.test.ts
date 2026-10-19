import { describe, it, expect } from 'vitest';
import { handleListWorkspaces } from './handle-list-workspaces.js';
import { createFakeWorkspaceStore } from '../infrastructure/fake-workspace-store.js';
import { createFakeOrganizationStore } from '../infrastructure/fake-organization-store.js';
import { createFakeOrganizationMembershipStore } from '../infrastructure/fake-organization-membership-store.js';
import { createFakeInvitationStore } from '../infrastructure/fake-invitation-store.js';
import type { Organization } from '../domain/organization.js';
import type { OrganizationMembership } from '../domain/organization-membership.js';
import type { OwnerAssigned } from '../domain/membership-events.js';

const now = '2024-06-15T12:00:00.000Z';
const org: Organization = {
  id: '550e8400-e29b-41d4-a716-446655440001',
  name: 'Garden Club',
  createdAt: '2024-01-01T00:00:00.000Z',
};
const membership: OrganizationMembership = {
  id: '550e8400-e29b-41d4-a716-446655440020',
  userId: '550e8400-e29b-41d4-a716-446655440010',
  organizationId: org.id,
  role: 'owner',
  isPersonalOrg: false,
  joinedAt: '2024-01-01T00:00:00.000Z',
};
const event: OwnerAssigned = {
  type: 'OwnerAssigned',
  id: '550e8400-e29b-41d4-a716-446655440098',
  organizationId: org.id,
  userId: membership.userId,
  fromRole: null,
  previousOwnerUserId: null,
  actor: { kind: 'app-admin' },
  occurredAt: now,
};

describe('handleListWorkspaces', () => {
  it('returns workspace summaries from the store rows and clock', async () => {
    const workspaceStore = createFakeWorkspaceStore({
      organizationStore: createFakeOrganizationStore(),
      membershipStore: createFakeOrganizationMembershipStore(),
      invitationStore: createFakeInvitationStore(),
    });
    await workspaceStore.createWithOwner(org, membership, event);
    const result = await handleListWorkspaces(
      { type: 'ListWorkspaces' },
      { workspaceStore, now: () => now }
    );
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual([
        {
          organization: org,
          personal: false,
          ownerStatus: { kind: 'has-owner', ownerUserId: membership.userId },
        },
      ]);
    }
  });

  it('maps a store failure to LIST_WORKSPACES_FAILED with the original cause', async () => {
    const workspaceStore = createFakeWorkspaceStore({
      organizationStore: createFakeOrganizationStore(),
      membershipStore: createFakeOrganizationMembershipStore(),
      invitationStore: createFakeInvitationStore(),
      shouldFailOnListOwnershipRows: true,
    });
    const result = await handleListWorkspaces(
      { type: 'ListWorkspaces' },
      { workspaceStore, now: () => now }
    );
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('LIST_WORKSPACES_FAILED');
      expect(result.error.type === 'LIST_WORKSPACES_FAILED' && result.error.cause).toBeInstanceOf(
        Error
      );
    }
  });
});

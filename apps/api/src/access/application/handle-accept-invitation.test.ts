import { describe, it, expect } from 'vitest';
import { OWNER_INVITE_WRONG_EMAIL_MESSAGE } from '@yoink/api-contracts';
import { handleAcceptInvitation } from './handle-accept-invitation.js';
import { createFakeInvitationStore } from '../infrastructure/fake-invitation-store.js';
import { createFakeOrganizationMembershipStore } from '../infrastructure/fake-organization-membership-store.js';
import type { Invitation } from '../domain/invitation.js';
import type { OrganizationMembership } from '../domain/organization-membership.js';

const now = '2024-06-15T12:00:00.000Z';
const orgId = '550e8400-e29b-41d4-a716-446655440001';
const userId = '550e8400-e29b-41d4-a716-446655440010';
const membershipId = '550e8400-e29b-41d4-a716-446655440002';

const invitation: Invitation = {
  id: '550e8400-e29b-41d4-a716-446655440030',
  code: 'MEMBER01',
  email: 'libby@example.com',
  organizationId: orgId,
  invitedByUserId: null,
  role: 'member',
  expiresAt: '2024-06-22T12:00:00.000Z',
  acceptedAt: null,
  acceptedByUserId: null,
  replacedAt: null,
  createdAt: '2024-06-08T12:00:00.000Z',
};

const account = { userId, email: 'libby@example.com' };

const handle = (input: {
  invitation?: Invitation;
  members?: OrganizationMembership[];
  account?: { userId: string; email: string };
  shouldFailOnAcceptInvitation?: boolean;
}) => {
  const invitationStore = createFakeInvitationStore({
    initialInvitations: input.invitation === undefined ? [invitation] : [input.invitation],
  });
  const membershipStore = createFakeOrganizationMembershipStore({
    initialMemberships: input.members ?? [],
    shouldFailOnAcceptInvitation: input.shouldFailOnAcceptInvitation,
  });
  return {
    invitationStore,
    membershipStore,
    run: () =>
      handleAcceptInvitation(
        { code: invitation.code, account: input.account ?? account },
        {
          invitationStore,
          membershipStore,
          nextId: () => membershipId,
          now: () => now,
        }
      ),
  };
};

describe('handleAcceptInvitation', () => {
  it('marks the invite accepted and adds membership with the invite role', async () => {
    const { membershipStore, run } = handle({});
    const result = await run();
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.acceptedAt).toBe(now);
      expect(result.value.acceptedByUserId).toBe(userId);
    }
    expect(membershipStore.acceptedInvitations()).toHaveLength(1);
    const saved = await membershipStore.findByUserAndOrg(userId, orgId);
    expect(saved.isOk() && saved.value?.role).toBe('member');
    expect(membershipStore.recordedEvents()).toHaveLength(0);
  });

  it('fails when the invitation does not exist', async () => {
    const invitationStore = createFakeInvitationStore();
    const membershipStore = createFakeOrganizationMembershipStore();
    const result = await handleAcceptInvitation(
      { code: 'NONEXIST1', account },
      {
        invitationStore,
        membershipStore,
        nextId: () => membershipId,
        now: () => now,
      }
    );
    expect(result.isErr() && result.error.type).toBe('INVITATION_NOT_FOUND');
    expect(membershipStore.acceptedInvitations()).toHaveLength(0);
    expect(membershipStore.recordedEvents()).toHaveLength(0);
  });

  it('fails when the invitation is expired', async () => {
    const { membershipStore, run } = handle({
      invitation: { ...invitation, expiresAt: '2024-06-01T12:00:00.000Z' },
    });
    const result = await run();
    expect(result.isErr() && result.error.type).toBe('INVITATION_EXPIRED');
    expect(membershipStore.acceptedInvitations()).toHaveLength(0);
  });

  it('fails when the invitation is already accepted', async () => {
    const { membershipStore, run } = handle({
      invitation: {
        ...invitation,
        acceptedAt: '2024-06-10T12:00:00.000Z',
        acceptedByUserId: userId,
      },
    });
    const result = await run();
    expect(result.isErr() && result.error.type).toBe('INVITATION_ALREADY_ACCEPTED');
    expect(membershipStore.acceptedInvitations()).toHaveLength(0);
  });

  it('refuses the wrong email, records no event, and leaves the invite unused', async () => {
    const { invitationStore, membershipStore, run } = handle({
      account: { userId: '550e8400-e29b-41d4-a716-446655440099', email: 'other@example.com' },
    });
    const result = await run();
    expect(result.isErr() && result.error.type).toBe('INVITATION_EMAIL_MISMATCH');
    if (result.isErr() && result.error.type === 'INVITATION_EMAIL_MISMATCH') {
      expect(result.error.message).toBe(OWNER_INVITE_WRONG_EMAIL_MESSAGE);
    }
    const stored = await invitationStore.findByCode(invitation.code);
    expect(stored.isOk() && stored.value?.acceptedAt).toBeNull();
    expect(membershipStore.acceptedInvitations()).toHaveLength(0);
    expect(membershipStore.recordedEvents()).toHaveLength(0);
  });

  it('leaves the invite unused when adding the membership fails', async () => {
    const { invitationStore, membershipStore, run } = handle({
      shouldFailOnAcceptInvitation: true,
    });
    const result = await run();
    expect(result.isErr() && result.error.type).toBe('ACCEPT_INVITATION_FAILED');
    const stored = await invitationStore.findByCode(invitation.code);
    expect(stored.isOk() && stored.value?.acceptedAt).toBeNull();
    expect(membershipStore.acceptedInvitations()).toHaveLength(0);
    expect(membershipStore.recordedEvents()).toHaveLength(0);
  });
});

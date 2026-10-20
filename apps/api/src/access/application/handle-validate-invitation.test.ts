import { describe, it, expect } from 'vitest';
import { OWNER_INVITE_WRONG_EMAIL_MESSAGE } from '@yoink/api-contracts';
import { handleValidateInvitation } from './handle-validate-invitation.js';
import { createFakeInvitationStore } from '../infrastructure/fake-invitation-store.js';
import type { Invitation } from '../domain/invitation.js';

const now = '2024-06-15T12:00:00.000Z';
const invitation: Invitation = {
  id: '550e8400-e29b-41d4-a716-446655440030',
  code: 'MEMBER01',
  email: 'libby@example.com',
  organizationId: '550e8400-e29b-41d4-a716-446655440001',
  invitedByUserId: null,
  role: 'member',
  expiresAt: '2024-06-22T12:00:00.000Z',
  acceptedAt: null,
  acceptedByUserId: null,
  replacedAt: null,
  createdAt: now,
};

describe('handleValidateInvitation', () => {
  it('returns the invite when the session email matches', async () => {
    const result = await handleValidateInvitation(
      { code: invitation.code, email: 'libby@example.com' },
      {
        invitationStore: createFakeInvitationStore({ initialInvitations: [invitation] }),
        now: () => now,
      }
    );
    expect(result.isOk() && result.value.code).toBe(invitation.code);
  });

  it('refuses a named-email invite for a different session email', async () => {
    const result = await handleValidateInvitation(
      { code: invitation.code, email: 'other@example.com' },
      {
        invitationStore: createFakeInvitationStore({ initialInvitations: [invitation] }),
        now: () => now,
      }
    );
    expect(result.isErr() && result.error.type).toBe('INVITATION_EMAIL_MISMATCH');
    if (result.isErr() && result.error.type === 'INVITATION_EMAIL_MISMATCH') {
      expect(result.error.message).toBe(OWNER_INVITE_WRONG_EMAIL_MESSAGE);
    }
  });
});

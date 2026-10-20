import { describe, it, expect } from 'vitest';
import {
  INVITATION_REPLACED_MESSAGE,
  OWNER_INVITE_WRONG_EMAIL_MESSAGE,
} from '@yoink/api-contracts';
import { decideValidateInvitation } from './decide-validate-invitation.js';
import type { Invitation } from './invitation.js';

const now = '2024-06-15T12:00:00.000Z';
const orgId = '550e8400-e29b-41d4-a716-446655440001';

const invite = (overrides: Partial<Invitation> = {}): Invitation => ({
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
  ...overrides,
});

const decide = (input: {
  invitation: Invitation | null;
  email?: string;
  code?: string;
}) =>
  decideValidateInvitation({
    query: { code: input.code ?? 'MEMBER01', email: input.email },
    invitation: input.invitation,
    now,
  });

describe('decideValidateInvitation', () => {
  it('returns a pending invite when no session email is given', () => {
    const pending = invite();
    const result = decide({ invitation: pending });
    expect(result.isOk() && result.value).toEqual(pending);
  });

  it('returns a pending open invite for any session email', () => {
    const result = decide({
      invitation: invite({ email: null }),
      email: 'anyone@example.com',
    });
    expect(result.isOk()).toBe(true);
  });

  it('refuses a named-email invite when the session email does not match', () => {
    const pending = invite();
    const result = decide({
      invitation: pending,
      email: 'other@example.com',
    });
    expect(result.isErr() && result.error.type).toBe('INVITATION_EMAIL_MISMATCH');
    if (result.isErr() && result.error.type === 'INVITATION_EMAIL_MISMATCH') {
      expect(result.error.message).toBe(OWNER_INVITE_WRONG_EMAIL_MESSAGE);
    }
    expect(pending.acceptedAt).toBeNull();
  });

  it('matches a named email ignoring capitals and spaces', () => {
    const result = decide({
      invitation: invite({ email: 'libby@example.com' }),
      email: '  Libby@Example.COM  ',
    });
    expect(result.isOk()).toBe(true);
  });

  it('refuses a missing invitation', () => {
    const result = decide({ invitation: null });
    expect(result.isErr() && result.error.type).toBe('INVITATION_NOT_FOUND');
  });

  it('refuses a replaced invite first', () => {
    const result = decide({
      invitation: invite({
        replacedAt: '2024-06-14T12:00:00.000Z',
        expiresAt: '2024-06-01T12:00:00.000Z',
        acceptedAt: '2024-06-01T12:00:00.000Z',
      }),
      email: 'other@example.com',
    });
    expect(result.isErr() && result.error.type).toBe('INVITATION_REPLACED');
    if (result.isErr() && result.error.type === 'INVITATION_REPLACED') {
      expect(result.error.message).toBe(INVITATION_REPLACED_MESSAGE);
    }
  });

  it('refuses an expired invite', () => {
    const result = decide({
      invitation: invite({ expiresAt: '2024-06-01T12:00:00.000Z' }),
    });
    expect(result.isErr() && result.error.type).toBe('INVITATION_EXPIRED');
  });

  it('refuses an already used invite', () => {
    const result = decide({
      invitation: invite({
        acceptedAt: '2024-06-10T12:00:00.000Z',
        acceptedByUserId: '550e8400-e29b-41d4-a716-446655440010',
      }),
    });
    expect(result.isErr() && result.error.type).toBe('INVITATION_ALREADY_ACCEPTED');
  });
});

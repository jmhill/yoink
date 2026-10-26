import { describe, expect, it } from 'vitest';
import type { ApiToken } from './api-token.js';
import type { Organization } from './organization.js';
import type { User } from './user.js';
import { decideValidateToken, parseToken, type ValidateTokenFacts } from './decide-validate-token.js';

const organization: Organization = {
  id: '550e8400-e29b-41d4-a716-446655440001',
  name: 'Test Org',
  createdAt: '2024-01-01T00:00:00.000Z',
};

const user: User = {
  id: '550e8400-e29b-41d4-a716-446655440002',
  email: 'lane@example.com',
  createdAt: '2024-01-01T00:00:00.000Z',
};

const token: ApiToken = {
  id: '550e8400-e29b-41d4-a716-446655440003',
  userId: user.id,
  organizationId: organization.id,
  tokenHash: 'hash',
  name: 'Lane',
  createdAt: '2024-01-01T00:00:00.000Z',
};

const compared = (
  overrides: Partial<Extract<ValidateTokenFacts, { kind: 'compared' }>> = {}
): Extract<ValidateTokenFacts, { kind: 'compared' }> => ({
  kind: 'compared',
  tokenId: token.id,
  token,
  secretMatches: true,
  organization,
  user,
  ...overrides,
});

describe('parseToken', () => {
  it('splits on the first colon so a secret may contain colons', () => {
    expect(parseToken(`${token.id}:one:two`)).toEqual({
      tokenId: token.id,
      secret: 'one:two',
    });
  });

  it('rejects a missing separator, an empty id, and an empty secret', () => {
    expect(parseToken('no-separator')).toBeNull();
    expect(parseToken(':secret')).toBeNull();
    expect(parseToken(`${token.id}:`)).toBeNull();
  });
});

describe('decideValidateToken', () => {
  it('accepts a matching live token', () => {
    const result = decideValidateToken(compared());

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual({ organization, user, token });
    }
  });

  it('returns invalid format when the plaintext could not be parsed', () => {
    const result = decideValidateToken({ kind: 'unparsed' });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toEqual({ type: 'INVALID_TOKEN_FORMAT' });
    }
  });

  it('returns not found for a missing token, user, or organization', () => {
    const missingToken = decideValidateToken(compared({ token: null, secretMatches: false }));
    const missingUser = decideValidateToken(compared({ user: null }));
    const missingOrganization = decideValidateToken(compared({ organization: null }));

    expect(missingToken.isErr() && missingToken.error).toEqual({
      type: 'TOKEN_NOT_FOUND',
      tokenId: token.id,
      subject: 'token',
    });
    expect(missingUser.isErr() && missingUser.error).toEqual({
      type: 'TOKEN_NOT_FOUND',
      tokenId: token.id,
      subject: 'user',
    });
    expect(missingOrganization.isErr() && missingOrganization.error).toEqual({
      type: 'TOKEN_NOT_FOUND',
      tokenId: token.id,
      subject: 'organization',
    });
  });

  it('returns invalid secret before it reports a revoked token', () => {
    const result = decideValidateToken(
      compared({ secretMatches: false, token: { ...token, revokedAt: '2026-10-09T12:00:00.000Z' } })
    );

    expect(result.isErr() && result.error).toEqual({
      type: 'INVALID_SECRET',
      tokenId: token.id,
    });
  });

  it('returns revoked after the secret matches', () => {
    const result = decideValidateToken(
      compared({ token: { ...token, revokedAt: '2026-10-09T12:00:00.000Z' } })
    );

    expect(result.isErr() && result.error).toEqual({
      type: 'TOKEN_REVOKED',
      tokenId: token.id,
    });
  });

  it('returns a storage error with the token id and the original cause', () => {
    const cause = new Error('turso stalled');
    const result = decideValidateToken({
      kind: 'storage-failed',
      tokenId: token.id,
      message: 'Failed to find token',
      cause,
    });

    expect(result.isErr() && result.error).toEqual({
      type: 'TOKEN_STORAGE_ERROR',
      message: 'Failed to find token',
      tokenId: token.id,
      cause,
    });
  });

  it('returns a hash error with the token id and the original cause', () => {
    const cause = new Error('bcrypt stalled');
    const result = decideValidateToken({
      kind: 'hash-failed',
      tokenId: token.id,
      cause,
    });

    expect(result.isErr() && result.error).toEqual({
      type: 'TOKEN_HASH_ERROR',
      message: 'Failed to compare token secret',
      tokenId: token.id,
      cause,
    });
  });
});

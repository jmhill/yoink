import { describe, expect, it } from 'vitest';
import {
  invalidSecretError,
  invalidTokenFormatError,
  tokenHashError,
  tokenNotFoundError,
  tokenRevokedError,
  tokenStorageError,
  type TokenValidationError,
} from '../domain/auth-errors.js';
import {
  AUTH_TRY_AGAIN_MESSAGE,
  INVALID_TOKEN_MESSAGE,
  mapTokenValidationError,
} from './token-validation-response.js';

const tokenId = '550e8400-e29b-41d4-a716-446655440003';
const stalled = new Error('turso stalled for 5s');
const hashFailed = new Error('bcrypt stalled');

const samples = {
  INVALID_TOKEN_FORMAT: invalidTokenFormatError(),
  TOKEN_NOT_FOUND: tokenNotFoundError(tokenId, 'token'),
  INVALID_SECRET: invalidSecretError(tokenId),
  TOKEN_REVOKED: tokenRevokedError(tokenId),
  TOKEN_STORAGE_ERROR: tokenStorageError('Failed to find token', stalled, tokenId),
  TOKEN_HASH_ERROR: tokenHashError(tokenId, hashFailed),
} satisfies Record<TokenValidationError['type'], TokenValidationError>;

describe('mapTokenValidationError', () => {
  it('keeps a truly bad token as 401 Invalid token and records the specific reason', () => {
    const format = mapTokenValidationError(samples.INVALID_TOKEN_FORMAT, 4);
    const missing = mapTokenValidationError(samples.TOKEN_NOT_FOUND, 5);
    const secret = mapTokenValidationError(samples.INVALID_SECRET, 6);
    const revoked = mapTokenValidationError(samples.TOKEN_REVOKED, 7);

    expect(format).toMatchObject({
      status: 401,
      body: { message: INVALID_TOKEN_MESSAGE },
      retryAfterSeconds: null,
      log: {
        level: 'warn',
        reason: 'INVALID_TOKEN_FORMAT',
        tokenId: null,
        durationMs: 4,
        subject: null,
      },
    });
    expect(missing).toMatchObject({
      status: 401,
      body: { message: INVALID_TOKEN_MESSAGE },
      log: {
        level: 'warn',
        reason: 'TOKEN_NOT_FOUND',
        tokenId,
        subject: 'token',
        durationMs: 5,
      },
    });
    expect(secret).toMatchObject({
      status: 401,
      body: { message: INVALID_TOKEN_MESSAGE },
      log: { level: 'warn', reason: 'INVALID_SECRET', tokenId, durationMs: 6 },
    });
    expect(revoked).toMatchObject({
      status: 401,
      body: { message: INVALID_TOKEN_MESSAGE },
      log: { level: 'warn', reason: 'TOKEN_REVOKED', tokenId, durationMs: 7 },
    });
  });

  it('maps a storage or hash failure to try again and keeps the original error', () => {
    const storage = mapTokenValidationError(samples.TOKEN_STORAGE_ERROR, 18);
    const hash = mapTokenValidationError(samples.TOKEN_HASH_ERROR, 19);

    expect(storage.status).toBe(503);
    expect(storage.body.message).toBe(AUTH_TRY_AGAIN_MESSAGE);
    expect(storage.body.message).not.toBe(INVALID_TOKEN_MESSAGE);
    expect(storage.retryAfterSeconds).toBe(1);
    expect(storage.log).toEqual({
      level: 'error',
      reason: 'TOKEN_STORAGE_ERROR',
      tokenId,
      durationMs: 18,
      error: stalled,
    });

    expect(hash.status).toBe(503);
    expect(hash.body.message).toBe(AUTH_TRY_AGAIN_MESSAGE);
    expect(hash.log).toEqual({
      level: 'error',
      reason: 'TOKEN_HASH_ERROR',
      tokenId,
      durationMs: 19,
      error: hashFailed,
    });
  });
});

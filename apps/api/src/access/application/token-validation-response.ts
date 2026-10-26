import type { FastifyReply, FastifyRequest } from 'fastify';
import type { TokenValidationError } from '../domain/auth-errors.js';
import { loggedCause } from './access-http-errors.js';

export const INVALID_TOKEN_MESSAGE = 'Invalid token';

export const AUTH_TRY_AGAIN_MESSAGE =
  'Authentication is temporarily unavailable. Try again.';

const RETRY_AFTER_SECONDS = 1;

export type TokenValidationFailureLog =
  | {
      readonly level: 'warn';
      readonly reason: TokenValidationError['type'];
      readonly tokenId: string | null;
      readonly durationMs: number;
      readonly subject: string | null;
    }
  | {
      readonly level: 'error';
      readonly reason: 'TOKEN_STORAGE_ERROR' | 'TOKEN_HASH_ERROR';
      readonly tokenId: string | null;
      readonly durationMs: number;
      readonly error: unknown;
    };

export type TokenValidationHttpFailure = {
  readonly status: 401 | 503;
  readonly body: { readonly message: string };
  readonly retryAfterSeconds: number | null;
  readonly log: TokenValidationFailureLog;
};

const authFailure = (
  reason: 'INVALID_TOKEN_FORMAT' | 'TOKEN_NOT_FOUND' | 'INVALID_SECRET' | 'TOKEN_REVOKED',
  tokenId: string | null,
  subject: string | null,
  durationMs: number
): TokenValidationHttpFailure => ({
  status: 401,
  body: { message: INVALID_TOKEN_MESSAGE },
  retryAfterSeconds: null,
  log: { level: 'warn', reason, tokenId, durationMs, subject },
});

const unavailable = (
  reason: 'TOKEN_STORAGE_ERROR' | 'TOKEN_HASH_ERROR',
  tokenId: string | null,
  durationMs: number,
  error: unknown
): TokenValidationHttpFailure => ({
  status: 503,
  body: { message: AUTH_TRY_AGAIN_MESSAGE },
  retryAfterSeconds: RETRY_AFTER_SECONDS,
  log: { level: 'error', reason, tokenId, durationMs, error },
});

export const mapTokenValidationError = (
  error: TokenValidationError,
  durationMs: number
): TokenValidationHttpFailure => {
  switch (error.type) {
    case 'INVALID_TOKEN_FORMAT':
      return authFailure(error.type, null, null, durationMs);
    case 'TOKEN_NOT_FOUND':
      return authFailure(error.type, error.tokenId, error.subject, durationMs);
    case 'INVALID_SECRET':
      return authFailure(error.type, error.tokenId, null, durationMs);
    case 'TOKEN_REVOKED':
      return authFailure(error.type, error.tokenId, null, durationMs);
    case 'TOKEN_STORAGE_ERROR':
      return unavailable(error.type, error.tokenId ?? null, durationMs, error.cause ?? error);
    case 'TOKEN_HASH_ERROR':
      return unavailable(error.type, error.tokenId, durationMs, error.cause);
    default: {
      const _never: never = error;
      return unavailable('TOKEN_STORAGE_ERROR', null, durationMs, _never);
    }
  }
};

const logFields = (entry: TokenValidationFailureLog): Record<string, unknown> => {
  const tokenId = entry.tokenId === null ? {} : { tokenId: entry.tokenId };
  switch (entry.level) {
    case 'warn': {
      const subject = entry.subject === null ? {} : { subject: entry.subject };
      return {
        reason: entry.reason,
        durationMs: entry.durationMs,
        ...tokenId,
        ...subject,
      };
    }
    case 'error':
      return {
        reason: entry.reason,
        durationMs: entry.durationMs,
        ...tokenId,
        error: loggedCause(entry.error),
      };
    default: {
      const _never: never = entry;
      return { error: _never };
    }
  }
};

const logTokenValidationFailure = (
  request: FastifyRequest,
  entry: TokenValidationFailureLog
): void => {
  const fields = logFields(entry);
  switch (entry.level) {
    case 'warn':
      request.log.warn(fields, 'Token validation failed');
      return;
    case 'error':
      request.log.error(fields, 'Token validation failed');
      return;
    default: {
      const _never: never = entry;
      request.log.error({ error: _never }, 'Token validation failed');
    }
  }
};

export const replyTokenValidationFailure = (
  request: FastifyRequest,
  reply: FastifyReply,
  error: TokenValidationError,
  durationMs: number
) => {
  const failure = mapTokenValidationError(error, durationMs);
  logTokenValidationFailure(request, failure.log);
  const pending = reply.status(failure.status);
  const response =
    failure.retryAfterSeconds === null
      ? pending
      : pending.header('Retry-After', String(failure.retryAfterSeconds));
  return response.send(failure.body);
};

export const validationDurationMs = (startedAt: number): number =>
  Math.max(0, Math.round(performance.now() - startedAt));

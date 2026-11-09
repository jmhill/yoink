import { err, ok, type Result } from 'neverthrow';
import type { ApiToken } from './api-token.js';
import type { Organization } from './organization.js';
import type { User } from './user.js';
import {
  invalidSecretError,
  invalidTokenFormatError,
  tokenHashError,
  tokenNotFoundError,
  tokenRevokedError,
  tokenStorageError,
  type TokenValidationError,
} from './auth-errors.js';

export type ValidatedToken = {
  readonly organization: Organization;
  readonly user: User;
  readonly token: ApiToken;
};

export type ParsedToken = {
  readonly tokenId: string;
  readonly secret: string;
};

export type ValidateTokenFacts =
  | { readonly kind: 'unparsed' }
  | {
      readonly kind: 'storage-failed';
      readonly tokenId: string;
      readonly message: string;
      readonly cause: unknown;
    }
  | {
      readonly kind: 'hash-failed';
      readonly tokenId: string;
      readonly cause: unknown;
    }
  | {
      readonly kind: 'compared';
      readonly tokenId: string;
      readonly token: ApiToken | null;
      readonly secretMatches: boolean;
      readonly organization: Organization | null;
      readonly user: User | null;
    };

/** Split `tokenId:secret`. The secret stays with the caller and is never part of an error. */
export const parseToken = (plaintext: string): ParsedToken | null => {
  const colonIndex = plaintext.indexOf(':');
  if (colonIndex <= 0) {
    return null;
  }

  const tokenId = plaintext.slice(0, colonIndex);
  const secret = plaintext.slice(colonIndex + 1);
  if (secret.length === 0) {
    return null;
  }

  return { tokenId, secret };
};

const decideCompared = (
  facts: Extract<ValidateTokenFacts, { readonly kind: 'compared' }>
): Result<ValidatedToken, TokenValidationError> => {
  const token = facts.token;
  if (!token) {
    return err(tokenNotFoundError(facts.tokenId, 'token'));
  }

  if (!facts.secretMatches) {
    return err(invalidSecretError(facts.tokenId));
  }

  if (token.revokedAt) {
    return err(tokenRevokedError(facts.tokenId));
  }

  if (!facts.organization) {
    return err(tokenNotFoundError(facts.tokenId, 'organization'));
  }

  if (!facts.user) {
    return err(tokenNotFoundError(facts.tokenId, 'user'));
  }

  return ok({
    organization: facts.organization,
    user: facts.user,
    token,
  });
};

/**
 * Pure token-check decision. The shell loads rows and the hash comparison;
 * this function only classifies those facts.
 */
export const decideValidateToken = (
  facts: ValidateTokenFacts
): Result<ValidatedToken, TokenValidationError> => {
  switch (facts.kind) {
    case 'unparsed':
      return err(invalidTokenFormatError());
    case 'storage-failed':
      return err(tokenStorageError(facts.message, facts.cause, facts.tokenId));
    case 'hash-failed':
      return err(tokenHashError(facts.tokenId, facts.cause));
    case 'compared':
      return decideCompared(facts);
    default: {
      const _never: never = facts;
      return err(tokenStorageError('Unrecognized token validation facts', _never));
    }
  }
};

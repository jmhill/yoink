import { errAsync, okAsync, ResultAsync } from 'neverthrow';
import type { Clock } from '../../kernel/clock.js';
import type { PasswordHasher } from '../../kernel/password-hasher.js';
import type { OrganizationStore } from '../domain/organization-store.js';
import type { UserStore } from '../domain/user-store.js';
import type { TokenStore } from '../domain/token-store.js';
import type { ValidateTokenQuery } from '../domain/token-queries.js';
import type { TokenValidationError } from '../domain/auth-errors.js';
import {
  decideValidateToken,
  parseToken,
  type ValidateTokenFacts,
  type ValidatedToken,
} from '../domain/decide-validate-token.js';

export type AuthResult = ValidatedToken;

export type TokenService = {
  validateToken(query: ValidateTokenQuery): ResultAsync<AuthResult, TokenValidationError>;
};

export type TokenServiceDependencies = {
  organizationStore: OrganizationStore;
  userStore: UserStore;
  tokenStore: TokenStore;
  passwordHasher: PasswordHasher;
  clock: Clock;
};

// Real bcrypt hash of an unrelated password. compare() returns false for every
// other secret, including when the token row is missing, instead of throwing
// on a malformed dummy hash and looking like "token not found".
const DUMMY_HASH = '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi';

const compareSecret = (
  compare: PasswordHasher['compare'],
  secret: string,
  hash: string
): ResultAsync<boolean, unknown> => {
  try {
    return ResultAsync.fromPromise(compare(secret, hash), (cause) => cause);
  } catch (cause) {
    return errAsync(cause);
  }
};

type StorageFailure = {
  readonly message: string;
  readonly cause?: unknown;
};

const storageFailed = (
  tokenId: string,
  error: StorageFailure
): ValidateTokenFacts => ({
  kind: 'storage-failed',
  tokenId,
  message: error.message,
  cause: error.cause ?? error,
});

const loadValidateTokenFacts = async (
  query: ValidateTokenQuery,
  deps: TokenServiceDependencies
): Promise<ValidateTokenFacts> => {
  const parsed = parseToken(query.plaintext);
  if (!parsed) {
    return { kind: 'unparsed' };
  }

  const found = await deps.tokenStore.findById(parsed.tokenId);
  if (found.isErr()) {
    return storageFailed(parsed.tokenId, found.error);
  }

  const token = found.value;
  const compared = await compareSecret(
    deps.passwordHasher.compare,
    parsed.secret,
    token?.tokenHash ?? DUMMY_HASH
  );
  if (compared.isErr()) {
    return {
      kind: 'hash-failed',
      tokenId: parsed.tokenId,
      cause: compared.error,
    };
  }

  if (!token || !compared.value || token.revokedAt) {
    return {
      kind: 'compared',
      tokenId: parsed.tokenId,
      token,
      secretMatches: compared.value,
      organization: null,
      user: null,
    };
  }

  const organization = await deps.organizationStore.findById(token.organizationId);
  if (organization.isErr()) {
    return storageFailed(parsed.tokenId, organization.error);
  }

  if (!organization.value) {
    return {
      kind: 'compared',
      tokenId: parsed.tokenId,
      token,
      secretMatches: true,
      organization: null,
      user: null,
    };
  }

  const user = await deps.userStore.findById(token.userId);
  if (user.isErr()) {
    return storageFailed(parsed.tokenId, user.error);
  }

  return {
    kind: 'compared',
    tokenId: parsed.tokenId,
    token,
    secretMatches: true,
    organization: organization.value,
    user: user.value,
  };
};

/** Validate decides from the queries and the hash compare. The last-used update stays the token store and does not fail the request. */
export const createTokenService = (deps: TokenServiceDependencies): TokenService => ({
  validateToken: (query) =>
    ResultAsync.fromSafePromise(loadValidateTokenFacts(query, deps)).andThen((facts) => {
      const decision = decideValidateToken(facts);
      if (decision.isErr()) {
        return errAsync(decision.error);
      }

      void deps.tokenStore.updateLastUsed(decision.value.token.id, deps.clock.now().toISOString());
      return okAsync(decision.value);
    }),
});

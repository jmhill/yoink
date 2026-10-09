import type { TokenStorageError } from './auth-errors.js';
import {
  tokenLimitReachedError,
  tokenOwnershipError,
  userTokenNotFoundError,
  type TokenLimitReachedError,
  type TokenOwnershipError,
  type UserTokenNotFoundError,
} from './auth-errors.js';

export type InvalidTokenNameError = {
  readonly type: 'INVALID_TOKEN_NAME';
  readonly message: string;
};

export type BotCannotManageTokensError = {
  readonly type: 'BOT_CANNOT_MANAGE_TOKENS';
  readonly message: string;
};

export type CreateTokenError =
  | BotCannotManageTokensError
  | InvalidTokenNameError
  | TokenLimitReachedError
  | TokenOwnershipError
  | TokenStorageError;

export type RevokeTokenError =
  | BotCannotManageTokensError
  | UserTokenNotFoundError
  | TokenOwnershipError
  | TokenStorageError;

export type ListTokensError = TokenStorageError;

export const invalidTokenNameError = (message: string): InvalidTokenNameError => ({
  type: 'INVALID_TOKEN_NAME',
  message,
});

export const botCannotManageTokensError = (): BotCannotManageTokensError => ({
  type: 'BOT_CANNOT_MANAGE_TOKENS',
  message: 'Bot tokens cannot create, reissue, or revoke tokens',
});

export {
  tokenLimitReachedError,
  tokenOwnershipError,
  userTokenNotFoundError,
};

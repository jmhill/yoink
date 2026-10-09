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

export type DuplicateTokenNameError = {
  readonly type: 'DUPLICATE_TOKEN_NAME';
  readonly name: string;
  readonly message: string;
};

export type BotCannotManageTokensError = {
  readonly type: 'BOT_CANNOT_MANAGE_TOKENS';
  readonly message: string;
};

export type CreateNamedTokenError =
  | BotCannotManageTokensError
  | InvalidTokenNameError
  | DuplicateTokenNameError
  | TokenLimitReachedError
  | TokenOwnershipError
  | TokenStorageError;

export type RenameTokenError =
  | BotCannotManageTokensError
  | InvalidTokenNameError
  | DuplicateTokenNameError
  | UserTokenNotFoundError
  | TokenOwnershipError
  | TokenStorageError;

export type RevokeTokenError =
  | BotCannotManageTokensError
  | UserTokenNotFoundError
  | TokenOwnershipError
  | DuplicateTokenNameError
  | TokenStorageError;

export type ListTokensError = TokenStorageError;

export const invalidTokenNameError = (message: string): InvalidTokenNameError => ({
  type: 'INVALID_TOKEN_NAME',
  message,
});

export const duplicateTokenNameError = (name: string): DuplicateTokenNameError => ({
  type: 'DUPLICATE_TOKEN_NAME',
  name,
  message: 'A token with this name already exists',
});

export const botCannotManageTokensError = (): BotCannotManageTokensError => ({
  type: 'BOT_CANNOT_MANAGE_TOKENS',
  message: 'Bot tokens cannot create, rename, or revoke tokens',
});

export {
  tokenLimitReachedError,
  tokenOwnershipError,
  userTokenNotFoundError,
};

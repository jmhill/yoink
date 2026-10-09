import { err, ok, type Result } from 'neverthrow';
import { invalidTokenNameError, type InvalidTokenNameError } from './token-errors.js';

export const TOKEN_NAME_MAX_LENGTH = 200;

declare const tokenNameBrand: unique symbol;

export type TokenName = string & { readonly [tokenNameBrand]: typeof tokenNameBrand };

export const normalizeTokenName = (name: string): string => name.trim().toLowerCase();

export const asTokenName = (name: string): TokenName => name as TokenName;

export const parseTokenName = (raw: string): Result<TokenName, InvalidTokenNameError> => {
  const name = raw.trim();

  if (name.length < 1) {
    return err(invalidTokenNameError('Name is required'));
  }

  if (name.length > TOKEN_NAME_MAX_LENGTH) {
    return err(invalidTokenNameError('Name must be 200 characters or fewer'));
  }

  return ok(asTokenName(name));
};

export const tokenNameIsTaken = (
  name: string,
  existingNames: readonly string[]
): boolean => {
  const normalized = normalizeTokenName(name);
  return existingNames.some((existing) => normalizeTokenName(existing) === normalized);
};

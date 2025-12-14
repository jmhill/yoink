import { describe, it, expect } from 'vitest';
import {
  userStorageError,
  tokenStorageError,
  organizationStorageError,
  invalidTokenFormatError,
  tokenNotFoundError,
  invalidSecretError,
  userNotFoundError,
  organizationNotFoundError,
} from './auth-errors.js';

describe('auth-errors', () => {
  describe('userStorageError', () => {
    it('creates error with message', () => {
      const error = userStorageError('Failed to save user');

      expect(error.type).toBe('USER_STORAGE_ERROR');
      expect(error.message).toBe('Failed to save user');
      expect(error.cause).toBeUndefined();
    });

    it('creates error with message and cause', () => {
      const cause = new Error('Database connection failed');
      const error = userStorageError('Failed to save user', cause);

      expect(error.type).toBe('USER_STORAGE_ERROR');
      expect(error.message).toBe('Failed to save user');
      expect(error.cause).toBe(cause);
    });
  });

  describe('tokenStorageError', () => {
    it('creates error with message', () => {
      const error = tokenStorageError('Failed to save token');

      expect(error.type).toBe('TOKEN_STORAGE_ERROR');
      expect(error.message).toBe('Failed to save token');
      expect(error.cause).toBeUndefined();
    });

    it('creates error with message and cause', () => {
      const cause = new Error('Database connection failed');
      const error = tokenStorageError('Failed to save token', cause);

      expect(error.type).toBe('TOKEN_STORAGE_ERROR');
      expect(error.message).toBe('Failed to save token');
      expect(error.cause).toBe(cause);
    });
  });

  describe('organizationStorageError', () => {
    it('creates error with message', () => {
      const error = organizationStorageError('Failed to save organization');

      expect(error.type).toBe('ORGANIZATION_STORAGE_ERROR');
      expect(error.message).toBe('Failed to save organization');
      expect(error.cause).toBeUndefined();
    });

    it('creates error with message and cause', () => {
      const cause = new Error('Database connection failed');
      const error = organizationStorageError('Failed to save organization', cause);

      expect(error.type).toBe('ORGANIZATION_STORAGE_ERROR');
      expect(error.message).toBe('Failed to save organization');
      expect(error.cause).toBe(cause);
    });
  });

  describe('invalidTokenFormatError', () => {
    it('creates error with correct type', () => {
      const error = invalidTokenFormatError();

      expect(error.type).toBe('INVALID_TOKEN_FORMAT');
    });
  });

  describe('tokenNotFoundError', () => {
    it('creates error with tokenId', () => {
      const error = tokenNotFoundError('token-123');

      expect(error.type).toBe('TOKEN_NOT_FOUND');
      expect(error.tokenId).toBe('token-123');
    });
  });

  describe('invalidSecretError', () => {
    it('creates error with tokenId', () => {
      const error = invalidSecretError('token-123');

      expect(error.type).toBe('INVALID_SECRET');
      expect(error.tokenId).toBe('token-123');
    });
  });

  describe('userNotFoundError', () => {
    it('creates error with userId', () => {
      const error = userNotFoundError('user-456');

      expect(error.type).toBe('USER_NOT_FOUND');
      expect(error.userId).toBe('user-456');
    });
  });

  describe('organizationNotFoundError', () => {
    it('creates error with organizationId', () => {
      const error = organizationNotFoundError('org-789');

      expect(error.type).toBe('ORGANIZATION_NOT_FOUND');
      expect(error.organizationId).toBe('org-789');
    });
  });
});

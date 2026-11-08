import { describe, it, expect } from 'vitest';
import { storageError } from './capture-errors.js';

describe('storageError', () => {
  it('creates a storage error with message', () => {
    const error = storageError('Database connection failed');

    expect(error).toEqual({
      type: 'STORAGE_ERROR',
      message: 'Database connection failed',
    });
  });

  it('includes cause when provided', () => {
    const cause = new Error('Connection refused');
    const error = storageError('Database connection failed', cause);

    expect(error).toEqual({
      type: 'STORAGE_ERROR',
      message: 'Database connection failed',
      cause,
    });
  });
});

import { describe, it, expect } from 'vitest';
import type { TokenStore } from '../../auth/domain/token-store.js';
import { createSqliteHealthChecker } from './sqlite-health-checker.js';

describe('SqliteHealthChecker', () => {
  const createFakeTokenStore = (options: {
    hasAnyTokensResult?: boolean;
    shouldThrow?: boolean;
  } = {}): TokenStore => ({
    save: async () => {},
    findById: async () => null,
    updateLastUsed: async () => {},
    hasAnyTokens: async () => {
      if (options.shouldThrow) {
        throw new Error('Database connection failed');
      }
      return options.hasAnyTokensResult ?? false;
    },
  });

  it('returns healthy/connected when database query succeeds', async () => {
    const tokenStore = createFakeTokenStore({ hasAnyTokensResult: true });
    const healthChecker = createSqliteHealthChecker({ tokenStore });

    const result = await healthChecker.check();

    expect(result).toEqual({
      status: 'healthy',
      database: 'connected',
    });
  });

  it('returns healthy/connected even when no tokens exist', async () => {
    const tokenStore = createFakeTokenStore({ hasAnyTokensResult: false });
    const healthChecker = createSqliteHealthChecker({ tokenStore });

    const result = await healthChecker.check();

    expect(result).toEqual({
      status: 'healthy',
      database: 'connected',
    });
  });

  it('returns unhealthy/disconnected when database query fails', async () => {
    const tokenStore = createFakeTokenStore({ shouldThrow: true });
    const healthChecker = createSqliteHealthChecker({ tokenStore });

    const result = await healthChecker.check();

    expect(result).toEqual({
      status: 'unhealthy',
      database: 'disconnected',
    });
  });
});

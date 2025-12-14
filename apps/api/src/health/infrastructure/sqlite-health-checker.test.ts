import { describe, it, expect } from 'vitest';
import { createFakeTokenStore } from '../../auth/infrastructure/fake-token-store.js';
import { createSqliteHealthChecker } from './sqlite-health-checker.js';

describe('SqliteHealthChecker', () => {
  it('returns healthy/connected when database query succeeds', async () => {
    const tokenStore = createFakeTokenStore();
    const healthChecker = createSqliteHealthChecker({ tokenStore });

    const result = await healthChecker.check();

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual({
        status: 'healthy',
        database: 'connected',
      });
    }
  });

  it('returns error when database query fails', async () => {
    const tokenStore = createFakeTokenStore({ shouldFailOnFind: true });
    const healthChecker = createSqliteHealthChecker({ tokenStore });

    const result = await healthChecker.check();

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('HEALTH_CHECK_ERROR');
    }
  });
});

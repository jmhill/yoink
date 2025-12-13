import type { TokenStore } from '../../auth/domain/token-store.js';
import type { HealthChecker, HealthStatus } from '../domain/health-checker.js';

export type SqliteHealthCheckerDependencies = {
  tokenStore: TokenStore;
};

export const createSqliteHealthChecker = (
  deps: SqliteHealthCheckerDependencies
): HealthChecker => {
  return {
    check: async (): Promise<HealthStatus> => {
      try {
        await deps.tokenStore.hasAnyTokens();
        return { status: 'healthy', database: 'connected' };
      } catch {
        return { status: 'unhealthy', database: 'disconnected' };
      }
    },
  };
};

import type { ResultAsync } from 'neverthrow';
import type { TokenStore } from '../../auth/domain/token-store.js';
import type { HealthChecker, HealthStatus } from '../domain/health-checker.js';
import { healthCheckError, type HealthCheckError } from '../domain/health-errors.js';

export type SqliteHealthCheckerDependencies = {
  tokenStore: TokenStore;
};

export const createSqliteHealthChecker = (
  deps: SqliteHealthCheckerDependencies
): HealthChecker => {
  return {
    check: (): ResultAsync<HealthStatus, HealthCheckError> => {
      return deps.tokenStore
        .hasAnyTokens()
        .map(() => ({ status: 'healthy', database: 'connected' }) as HealthStatus)
        .mapErr(() => healthCheckError('Database health check failed'));
    },
  };
};

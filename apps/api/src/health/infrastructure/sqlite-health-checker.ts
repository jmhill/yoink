import type { ResultAsync } from 'neverthrow';
// TODO(8.5.4): cross-context deep import of a store interface; the health
// check should depend on an access-context service (or a narrower port) instead
import type { TokenStore } from '../../access/domain/token-store.js';
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

import { ResultAsync } from 'neverthrow';
import type { Database } from '../database/types.js';
import type { HealthChecker, HealthStatus } from './health-checker.js';
import { healthCheckError, type HealthCheckError } from './health-errors.js';

export const createSqliteHealthChecker = (database: Database): HealthChecker => {
  return {
    check: (): ResultAsync<HealthStatus, HealthCheckError> => {
      return ResultAsync.fromPromise(
        database.execute({ sql: 'SELECT 1' }),
        () => healthCheckError('Database health check failed')
      ).map(() => ({ status: 'healthy', database: 'connected' }));
    },
  };
};

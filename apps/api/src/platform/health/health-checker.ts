import type { ResultAsync } from 'neverthrow';
import type { HealthCheckError } from './health-errors.js';

export type HealthStatus = {
  status: 'healthy' | 'unhealthy';
  database: 'connected' | 'disconnected';
};

export type HealthChecker = {
  check(): ResultAsync<HealthStatus, HealthCheckError>;
};

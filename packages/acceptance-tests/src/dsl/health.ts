import type { HealthStatus } from './types.js';

/**
 * Health check operations.
 * Used to verify the system is running and connected to its dependencies.
 */
export type Health = {
  /**
   * Check system health.
   * Does not require authentication.
   */
  check(): Promise<HealthStatus>;
};

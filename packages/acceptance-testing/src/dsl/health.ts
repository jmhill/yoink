import type { HealthStatus, PublicFileHeaders } from './types.js';

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

  /**
   * Inspect status and Cache-Control for a public static file.
   * Used to assert PWA entry files are never cached.
   */
  getPublicFileHeaders(path: string): Promise<PublicFileHeaders>;
};

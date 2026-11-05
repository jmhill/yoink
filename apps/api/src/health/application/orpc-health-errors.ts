import { ORPCError } from '@orpc/server';
import type { HealthCheckError } from '../domain/health-errors.js';

/** Adapter-only. The checker stays a Result; this builds the HTTP error. */
export const mapHealthCheckError = (error: HealthCheckError) => {
  switch (error.type) {
    case 'HEALTH_CHECK_ERROR':
      return new ORPCError('SERVICE_UNAVAILABLE', {
        message: 'Health check failed',
        cause: error,
      });
  }
};

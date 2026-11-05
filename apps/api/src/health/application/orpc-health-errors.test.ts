import { describe, expect, it } from 'vitest';
import { healthCheckError } from '../domain/health-errors.js';
import { mapHealthCheckError } from './orpc-health-errors.js';
import { yoinkErrorBody } from '../../shared/orpc/yoink-error-body.js';

describe('mapHealthCheckError', () => {
  it('maps a failed check to 503 without putting the cause on the wire', () => {
    const cause = new Error('sqlite closed');
    const error = healthCheckError('Database health check failed', cause);
    const mapped = mapHealthCheckError(error);

    expect(mapped.code).toBe('SERVICE_UNAVAILABLE');
    expect(mapped.message).toBe('Health check failed');
    expect(mapped.cause).toBe(error);
    expect(yoinkErrorBody(mapped)).toEqual({
      status: 'unhealthy',
      database: 'disconnected',
    });
  });
});

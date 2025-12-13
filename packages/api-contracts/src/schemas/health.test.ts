import { describe, it, expect } from 'vitest';
import { HealthResponseSchema } from './health.js';

describe('HealthResponseSchema', () => {
  it('validates healthy/connected status', () => {
    const result = HealthResponseSchema.safeParse({
      status: 'healthy',
      database: 'connected',
    });

    expect(result.success).toBe(true);
  });

  it('validates unhealthy/disconnected status', () => {
    const result = HealthResponseSchema.safeParse({
      status: 'unhealthy',
      database: 'disconnected',
    });

    expect(result.success).toBe(true);
  });

  it('validates mixed status combinations', () => {
    const result = HealthResponseSchema.safeParse({
      status: 'unhealthy',
      database: 'connected',
    });

    expect(result.success).toBe(true);
  });

  it('rejects invalid status value', () => {
    const result = HealthResponseSchema.safeParse({
      status: 'degraded',
      database: 'connected',
    });

    expect(result.success).toBe(false);
  });

  it('rejects invalid database value', () => {
    const result = HealthResponseSchema.safeParse({
      status: 'healthy',
      database: 'error',
    });

    expect(result.success).toBe(false);
  });

  it('rejects missing status', () => {
    const result = HealthResponseSchema.safeParse({
      database: 'connected',
    });

    expect(result.success).toBe(false);
  });

  it('rejects missing database', () => {
    const result = HealthResponseSchema.safeParse({
      status: 'healthy',
    });

    expect(result.success).toBe(false);
  });
});

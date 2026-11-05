import { describe, expect, it } from 'vitest';
import { ORPCError } from '@orpc/server';
import { serverFailureLog } from './server-failure-log.js';

describe('serverFailureLog', () => {
  it('logs the original cause of a 500', () => {
    const cause = { type: 'STORAGE_ERROR', message: 'disk full' };
    const logged = serverFailureLog(
      new ORPCError('INTERNAL_SERVER_ERROR', {
        message: 'Failed to create capture',
        cause,
      })
    );

    expect(logged).toEqual({
      error: cause,
      message: 'Failed to create capture',
    });
  });

  it('logs a health failure and stays quiet for client errors', () => {
    const cause = { type: 'HEALTH_CHECK_ERROR', message: 'down' };
    expect(
      serverFailureLog(
        new ORPCError('SERVICE_UNAVAILABLE', {
          message: 'Health check failed',
          cause,
        })
      )
    ).toEqual({ error: cause, message: 'Health check failed' });

    expect(
      serverFailureLog(new ORPCError('FORBIDDEN', { message: 'no' }))
    ).toBeUndefined();
    expect(serverFailureLog(new Error('boom'))).toBeUndefined();
  });
});

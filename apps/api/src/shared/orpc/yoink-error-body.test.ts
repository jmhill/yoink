import { describe, expect, it } from 'vitest';
import { ValidationError } from '@orpc/contract';
import { ORPCError } from '@orpc/server';
import { yoinkErrorBody } from './yoink-error-body.js';

describe('yoinkErrorBody', () => {
  it('maps input issues onto the ts-rest validation body', () => {
    const error = new ORPCError('BAD_REQUEST', {
      message: 'Input validation failed',
      cause: new ValidationError({
        message: 'Input validation failed',
        issues: [{ message: 'too small', path: ['content'] }],
        invalidData: {},
      }),
    });

    expect(yoinkErrorBody(error)).toEqual({
      message: 'Request validation failed: content',
      code: 'VALIDATION_FAILED',
      fields: ['content'],
    });
  });

  it('keeps cursor, forbidden, health, and storage bodies free of the oRPC envelope', () => {
    expect(
      yoinkErrorBody(new ORPCError('INVALID_CURSOR', { message: 'Cursor is invalid' }))
    ).toEqual({ message: 'Cursor is invalid', code: 'invalid_cursor' });

    expect(
      yoinkErrorBody(new ORPCError('FORBIDDEN', { message: 'Agents cannot create captures' }))
    ).toEqual({ message: 'Agents cannot create captures' });

    expect(yoinkErrorBody(new ORPCError('SERVICE_UNAVAILABLE', { message: 'Health check failed' }))).toEqual({
      status: 'unhealthy',
      database: 'disconnected',
    });

    expect(
      yoinkErrorBody(
        new ORPCError('INTERNAL_SERVER_ERROR', { message: 'Failed to create capture' })
      )
    ).toEqual({ message: 'Internal server error' });

    expect(yoinkErrorBody(new ORPCError('NOT_FOUND', { message: 'missing' }))).toEqual({
      message: 'missing',
    });

    expect(
      yoinkErrorBody(
        new ORPCError('FORBIDDEN', {
          message: 'Creating a project requires a person',
          data: { code: 'PROJECT_CREATE_REQUIRES_PERSON' },
        })
      )
    ).toEqual({
      message: 'Creating a project requires a person',
      code: 'PROJECT_CREATE_REQUIRES_PERSON',
    });
  });

  it('keeps extra closed-error fields and a public 500 message', () => {
    expect(
      yoinkErrorBody(
        new ORPCError('CONFLICT', {
          message: 'Hand over ownership first',
          data: { code: 'OWNER_MUST_TRANSFER', handoverPath: '/settings/members' },
        })
      )
    ).toEqual({
      message: 'Hand over ownership first',
      code: 'OWNER_MUST_TRANSFER',
      handoverPath: '/settings/members',
    });

    expect(
      yoinkErrorBody(
        new ORPCError('INTERNAL_SERVER_ERROR', {
          message: 'Failed to remove member',
          data: { publicMessage: "Couldn't remove Libby. Try again." },
        })
      )
    ).toEqual({ message: "Couldn't remove Libby. Try again." });

    expect(
      yoinkErrorBody(
        new ORPCError('INTERNAL_SERVER_ERROR', {
          message: 'Failed to list history',
          data: { code: 'STORAGE_ERROR' },
        })
      )
    ).toEqual({ message: 'Internal server error', code: 'STORAGE_ERROR' });
  });
});

import { describe, expect, it } from 'vitest';
import { invalidCursorError } from '../../kernel/listing/domain/invalid-cursor.js';
import { yoinkErrorBody } from '../../edges/_shared/orpc/yoink-error-body.js';
import { storageError } from '../domain/capture-errors.js';
import {
  mapAgentCaptureRefusal,
  mapCreateCaptureError,
  mapListCapturesError,
} from './orpc-capture-errors.js';

describe('oRPC capture error mapping', () => {
  it('refuses an agent and lets a human through', () => {
    const refused = mapAgentCaptureRefusal('agent');
    expect(refused?.code).toBe('FORBIDDEN');
    expect(refused === undefined ? undefined : yoinkErrorBody(refused)).toEqual({
      message: 'Agents cannot create captures',
    });
    expect(mapAgentCaptureRefusal('human')).toBeUndefined();
  });

  it('maps storage failures to a generic 500 and keeps the original error as the cause', () => {
    const cause = new Error('sqlite');
    const error = storageError('disk full', cause);
    const mapped = mapCreateCaptureError(error);

    expect(mapped.code).toBe('INTERNAL_SERVER_ERROR');
    expect(mapped.cause).toBe(error);
    expect(yoinkErrorBody(mapped)).toEqual({ message: 'Internal server error' });
  });

  it('maps a bad cursor to invalid_cursor and a list storage failure to 500', () => {
    const cursor = mapListCapturesError(invalidCursorError());
    expect(cursor.code).toBe('INVALID_CURSOR');
    expect(yoinkErrorBody(cursor)).toEqual({
      message: 'Cursor is invalid',
      code: 'invalid_cursor',
    });

    const storage = mapListCapturesError(storageError('disk full'));
    expect(storage.code).toBe('INTERNAL_SERVER_ERROR');
    expect(storage.message).toBe('Failed to list captures');
    expect(yoinkErrorBody(storage)).toEqual({ message: 'Internal server error' });
  });
});

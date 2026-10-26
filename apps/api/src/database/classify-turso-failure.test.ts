import { describe, expect, it } from 'vitest';
import { classifyTursoFailure } from './classify-turso-failure.js';
import { tursoCallTimeout } from './run-turso-call.js';

const withCode = (message: string, code: string, extra: Record<string, unknown> = {}) =>
  Object.assign(new Error(message), { code, ...extra });

describe('classifyTursoFailure', () => {
  it('treats timeouts and connection losses as retryable', () => {
    expect(classifyTursoFailure(tursoCallTimeout(5000))).toBe('connection');
    expect(classifyTursoFailure(withCode('socket hang up', 'ECONNRESET'))).toBe('connection');
    expect(classifyTursoFailure(Object.assign(new Error('The operation was aborted'), { name: 'AbortError' }))).toBe(
      'connection'
    );
    expect(classifyTursoFailure(new TypeError('fetch failed'))).toBe('connection');
    expect(
      classifyTursoFailure(withCode('Server returned HTTP status 503', 'SERVER_ERROR', { status: 503 }))
    ).toBe('connection');
    expect(
      classifyTursoFailure(
        withCode('Server returned HTTP status 500', 'SERVER_ERROR', {
          cause: { status: 500 },
        })
      )
    ).toBe('connection');
  });

  it('does not retry SQL errors or an HTTP client error from Turso', () => {
    expect(classifyTursoFailure(withCode('no such column: secret', 'SQLITE_ERROR'))).toBe('query');
    expect(classifyTursoFailure(withCode('UNIQUE constraint failed', 'SQLITE_CONSTRAINT'))).toBe(
      'query'
    );
    expect(
      classifyTursoFailure(
        withCode('Server returned HTTP status 401', 'SERVER_ERROR', {
          cause: { status: 401 },
        })
      )
    ).toBe('query');
  });
});

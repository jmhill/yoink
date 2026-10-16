import { describe, expect, it } from 'vitest';
import {
  decideShouldReportFastifyError,
  shouldHandleError,
  statusCodeFromError,
} from './should-handle-error.js';

const report = (error: unknown, replyStatusCode: number): boolean =>
  decideShouldReportFastifyError({ error, replyStatusCode }).report;

describe('statusCodeFromError', () => {
  it('reads statusCode or status from an error object', () => {
    expect(statusCodeFromError({ statusCode: 429 })).toBe(429);
    expect(statusCodeFromError({ status: 400 })).toBe(400);
    expect(statusCodeFromError(new Error('boom'))).toBeUndefined();
    expect(statusCodeFromError('nope')).toBeUndefined();
  });
});

describe('decideShouldReportFastifyError', () => {
  it('reports 500+ and unexpected crashes with no HTTP status', () => {
    expect(report({ statusCode: 500 }, 200)).toBe(true);
    expect(report({ statusCode: 503 }, 503)).toBe(true);
    expect(report(new Error('disk full'), 200)).toBe(true);
  });

  it('does not report any 4xx, including 400 and 429', () => {
    expect(report({ statusCode: 400 }, 400)).toBe(false);
    expect(report({ statusCode: 401 }, 401)).toBe(false);
    expect(report({ statusCode: 404 }, 404)).toBe(false);
    expect(report({ statusCode: 429 }, 200)).toBe(false);
    expect(report(new Error('validation'), 400)).toBe(false);
    expect(report(new Error('Rate limit exceeded, retry in 1 minute'), 200)).toBe(
      false
    );
    expect(report({ name: 'RequestValidationError', message: 'bad' }, 200)).toBe(
      false
    );
  });
});

describe('shouldHandleError', () => {
  it('is the Fastify callback Sentry receives', () => {
    expect(
      shouldHandleError(new Error('Rate limit exceeded, retry in 1 minute'), {}, {
        statusCode: 429,
      })
    ).toBe(false);
    expect(shouldHandleError(new Error('crash'), {}, { statusCode: 200 })).toBe(
      true
    );
    expect(
      shouldHandleError(Object.assign(new Error('nope'), { statusCode: 500 }), {}, {
        statusCode: 200,
      })
    ).toBe(true);
  });
});

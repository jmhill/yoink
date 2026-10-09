import { describe, expect, it } from 'vitest';
import type { LogConfig } from '../config/schema.js';
import {
  createSentryInitOptions,
  levelsAtOrAbove,
  redactSensitiveLogValue,
  scrubSentryLog,
} from './sentry.js';

const baseLog = (sentry: LogConfig['sentry']): LogConfig => ({
  level: 'info',
  pretty: false,
  sentry,
});

describe('levelsAtOrAbove', () => {
  it('includes the minimum level and every noisier level', () => {
    expect(levelsAtOrAbove('info')).toEqual(['info', 'warn', 'error', 'fatal']);
    expect(levelsAtOrAbove('error')).toEqual(['error', 'fatal']);
  });
});

describe('createSentryInitOptions', () => {
  const dsn = 'https://public@o0.ingest.sentry.io/0';

  it('keeps crash-reporting integrations and leaves logs off when disabled', () => {
    const options = createSentryInitOptions({
      dsn,
      environment: 'test',
      log: baseLog({ enabled: false, minLevel: 'info' }),
    });

    expect(options.enableLogs).toBe(false);
    expect(options.tracesSampleRate).toBe(0.1);
    expect(options.integrations?.map((integration) => integration.name)).toEqual([
      'OnUnhandledRejection',
    ]);
  });

  it('enables Sentry Logs and the official Pino integration without turning logs into issues', () => {
    const options = createSentryInitOptions({
      dsn,
      environment: 'production',
      log: baseLog({ enabled: true, minLevel: 'info' }),
    });

    expect(options.enableLogs).toBe(true);
    expect(options.integrations?.map((integration) => integration.name)).toEqual([
      'OnUnhandledRejection',
      'Pino',
    ]);

    const pino = options.integrations?.find((integration) => integration.name === 'Pino');
    expect(pino).toMatchObject({
      name: 'Pino',
    });
  });

  it('does not add the Pino integration when sentry config is omitted', () => {
    const options = createSentryInitOptions({
      dsn,
      environment: 'test',
      log: { level: 'error', pretty: false },
    });

    expect(options.enableLogs).toBe(false);
    expect(options.integrations?.some((integration) => integration.name === 'Pino')).toBe(
      false
    );
  });
});

describe('redactSensitiveLogValue', () => {
  it('redacts authorization and cookie values anywhere in the payload', () => {
    const redacted = redactSensitiveLogValue({
      req: {
        headers: {
          authorization: 'Bearer tokenId:super-secret-token',
          cookie: 'session=cookie-secret-value',
          'content-type': 'application/json',
        },
      },
      Authorization: 'Bearer also-secret',
    });

    expect(redacted).toEqual({
      req: {
        headers: {
          authorization: '[Redacted]',
          cookie: '[Redacted]',
          'content-type': 'application/json',
        },
      },
      Authorization: '[Redacted]',
    });
  });
});

describe('scrubSentryLog', () => {
  it('redacts auth headers, cookies, and token values before a log is sent', () => {
    const scrubbed = scrubSentryLog({
      level: 'info',
      message: 'incoming request',
      attributes: {
        req: {
          headers: {
            authorization: 'Bearer tokenId:super-secret-token',
            cookie: 'yoink_session=cookie-secret-value',
          },
        },
      },
    });

    const serialized = JSON.stringify(scrubbed);
    expect(serialized).not.toContain('super-secret-token');
    expect(serialized).not.toContain('cookie-secret-value');
    expect(serialized).toContain('[Redacted]');
  });
});

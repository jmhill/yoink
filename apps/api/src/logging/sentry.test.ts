import { afterEach, describe, expect, it } from 'vitest';
import Fastify from 'fastify';
import * as Sentry from '@sentry/node';
import type { Log } from '@sentry/node';
import type { LogConfig } from '../config/schema.js';
import { createLoggerOptions } from './logger.js';
import {
  createSentryInitOptions,
  levelsAtOrAbove,
  maskBearerTokens,
  redactSensitiveLogValue,
  scrubSentryLog,
} from './sentry.js';

const baseLog = (sentry: LogConfig['sentry']): LogConfig => ({
  level: 'info',
  pretty: false,
  sentry,
});

const fakeSentry = {
  dsn: 'https://public@o0.ingest.sentry.io/0',
  environment: 'test',
};

describe('levelsAtOrAbove', () => {
  it('includes the minimum level and every noisier level', () => {
    expect(levelsAtOrAbove('info')).toEqual(['info', 'warn', 'error', 'fatal']);
    expect(levelsAtOrAbove('error')).toEqual(['error', 'fatal']);
  });
});

describe('createSentryInitOptions', () => {
  it('keeps crash-reporting integrations and leaves logs off when disabled', () => {
    const options = createSentryInitOptions({
      sentry: fakeSentry,
      log: baseLog({ enabled: false, minLevel: 'info' }),
    });

    expect(options.enableLogs).toBe(false);
    expect(options.tracesSampleRate).toBe(0.1);
    expect(options.integrations.map((integration) => integration.name)).toEqual([
      'OnUnhandledRejection',
    ]);
  });

  it('enables Sentry Logs and the official Pino integration without turning logs into issues', () => {
    const options = createSentryInitOptions({
      sentry: { ...fakeSentry, environment: 'production' },
      log: baseLog({ enabled: true, minLevel: 'info' }),
    });

    expect(options.enableLogs).toBe(true);
    expect(options.integrations.map((integration) => integration.name)).toEqual([
      'OnUnhandledRejection',
      'Pino',
    ]);
    expect(options.integrations.find((integration) => integration.name === 'Pino')).toMatchObject({
      name: 'Pino',
    });
  });
});

describe('redactSensitiveLogValue', () => {
  it.each([
    ['authorization', 'Bearer tokenId:super-secret-token'],
    ['cookie', 'session=cookie-secret-value'],
    ['set-cookie', 'session=cookie-secret-value'],
    ['token', 'tokenId:super-secret-token'],
    ['apiToken', 'api-token-secret'],
    ['secret', 'top-secret-value'],
    ['password', 'hunter2'],
    ['sessionSecret', 'session-secret-value'],
    ['code', 'invite-code-value'],
    ['inviteCode', 'invite-code-value'],
    ['credential', 'passkey-credential'],
    ['attestationObject', 'attestation-bytes'],
    ['clientDataJSON', 'client-data-json'],
  ] as const)('redacts %s', (key, secret) => {
    const redacted = redactSensitiveLogValue({ nested: { [key]: secret } });

    const serialized = JSON.stringify(redacted);
    expect(serialized).not.toContain(secret);
    expect(redacted).toEqual({ nested: { [key]: '[Redacted]' } });
  });

  it('masks Bearer tokens inside non-sensitive string values', () => {
    expect(
      redactSensitiveLogValue({
        note: 'got Bearer tokenId:super-secret-token from the client',
      })
    ).toEqual({
      note: 'got Bearer [Redacted] from the client',
    });
  });
});

describe('maskBearerTokens', () => {
  it('replaces Bearer tokens in a log message', () => {
    expect(maskBearerTokens('auth used Bearer tokenId:super-secret-token')).toBe(
      'auth used Bearer [Redacted]'
    );
  });
});

describe('scrubSentryLog', () => {
  it('redacts auth headers, cookies, and token values before a log is sent', () => {
    const scrubbed = scrubSentryLog({
      level: 'info',
      message: 'incoming request with Bearer tokenId:super-secret-token',
      attributes: {
        req: {
          headers: {
            authorization: 'Bearer tokenId:super-secret-token',
            cookie: 'yoink_session=cookie-secret-value',
          },
        },
        token: 'tokenId:super-secret-token',
      },
    });

    const serialized = JSON.stringify(scrubbed);
    expect(serialized).not.toContain('super-secret-token');
    expect(serialized).not.toContain('cookie-secret-value');
    expect(scrubbed.message).toBe('incoming request with Bearer [Redacted]');
    expect(serialized).toContain('[Redacted]');
  });
});

describe('Pino forwarding to beforeSendLog', () => {
  afterEach(async () => {
    await Sentry.close();
  });

  it('delivers a Fastify Pino line to beforeSendLog', async () => {
    const captured: Log[] = [];
    const options = createSentryInitOptions({
      sentry: fakeSentry,
      log: baseLog({ enabled: true, minLevel: 'info' }),
    });

    Sentry.init({
      ...options,
      defaultIntegrations: false,
      transport: () => ({
        send: () => Promise.resolve({ statusCode: 200 }),
        flush: () => Promise.resolve(true),
      }),
      beforeSendLog: (log) => {
        captured.push(log);
        return null;
      },
    });

    const app = Fastify({
      logger: createLoggerOptions(baseLog({ enabled: true, minLevel: 'info' })),
    });
    await app.ready();
    app.log.info({ event: 'sentry-forward-probe' }, 'forwarded to sentry');
    await Sentry.flush(2000);
    await app.close();

    expect(captured.some((log) => log.message === 'forwarded to sentry')).toBe(true);
  });
});

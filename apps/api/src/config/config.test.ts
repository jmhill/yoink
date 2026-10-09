import { afterEach, describe, expect, it } from 'vitest';
import { loadLogConfig, loadSentryConfig } from './config.js';

const ENV_KEYS = [
  'NODE_ENV',
  'LOG_LEVEL',
  'SENTRY_DSN',
  'SENTRY_LOGS_ENABLED',
  'SENTRY_LOGS_LEVEL',
] as const;

const originalEnv = Object.fromEntries(
  ENV_KEYS.map((key) => [key, process.env[key]])
);

const setEnv = (env: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>>) => {
  for (const key of ENV_KEYS) {
    if (key in env) {
      const value = env[key];
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
};

describe('loadLogConfig', () => {
  afterEach(() => {
    for (const key of ENV_KEYS) {
      const value = originalEnv[key];
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  describe('Sentry Logs', () => {
    it('is enabled by default in production at info', () => {
      setEnv({
        NODE_ENV: 'production',
        SENTRY_LOGS_ENABLED: undefined,
        SENTRY_LOGS_LEVEL: undefined,
      });

      const config = loadLogConfig();

      expect(config.sentry).toEqual({ enabled: true, minLevel: 'info' });
    });

    it('is off in local development unless enabled', () => {
      setEnv({
        NODE_ENV: 'development',
        SENTRY_LOGS_ENABLED: undefined,
      });

      expect(loadLogConfig().sentry.enabled).toBe(false);
    });

    it('is off in tests unless enabled', () => {
      setEnv({
        NODE_ENV: 'test',
        SENTRY_LOGS_ENABLED: undefined,
      });

      expect(loadLogConfig().sentry.enabled).toBe(false);
    });

    it('can be enabled outside production with SENTRY_LOGS_ENABLED=true', () => {
      setEnv({
        NODE_ENV: 'test',
        SENTRY_LOGS_ENABLED: 'true',
        SENTRY_LOGS_LEVEL: 'warn',
      });

      expect(loadLogConfig().sentry).toEqual({ enabled: true, minLevel: 'warn' });
    });

    it('can be disabled in production with SENTRY_LOGS_ENABLED=false', () => {
      setEnv({
        NODE_ENV: 'production',
        SENTRY_LOGS_ENABLED: 'false',
      });

      expect(loadLogConfig().sentry.enabled).toBe(false);
    });

    it('rejects invalid SENTRY_LOGS_ENABLED values', () => {
      setEnv({
        NODE_ENV: 'production',
        SENTRY_LOGS_ENABLED: 'yes',
      });

      expect(() => loadLogConfig()).toThrow(/SENTRY_LOGS_ENABLED/);
    });

    it('rejects invalid SENTRY_LOGS_LEVEL values', () => {
      setEnv({
        NODE_ENV: 'production',
        SENTRY_LOGS_LEVEL: 'warning',
      });

      expect(() => loadLogConfig()).toThrow(/SENTRY_LOGS_LEVEL/);
    });
  });
});

describe('loadSentryConfig', () => {
  afterEach(() => {
    for (const key of ENV_KEYS) {
      const value = originalEnv[key];
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  it('omits dsn when SENTRY_DSN is unset and uses NODE_ENV as environment', () => {
    setEnv({
      NODE_ENV: 'production',
      SENTRY_DSN: undefined,
    });

    expect(loadSentryConfig()).toEqual({
      dsn: undefined,
      environment: 'production',
    });
  });

  it('parses a DSN URL', () => {
    setEnv({
      NODE_ENV: 'staging',
      SENTRY_DSN: 'https://public@o0.ingest.sentry.io/0',
    });

    expect(loadSentryConfig()).toEqual({
      dsn: 'https://public@o0.ingest.sentry.io/0',
      environment: 'staging',
    });
  });

  it('rejects an invalid DSN URL', () => {
    setEnv({
      SENTRY_DSN: 'not-a-url',
    });

    expect(() => loadSentryConfig()).toThrow();
  });
});

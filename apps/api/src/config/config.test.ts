import { afterEach, describe, expect, it } from 'vitest';
import { loadLogConfig } from './config.js';

const ENV_KEYS = [
  'NODE_ENV',
  'LOG_LEVEL',
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

      expect(loadLogConfig().sentry?.enabled).toBe(false);
    });

    it('is off in tests unless enabled', () => {
      setEnv({
        NODE_ENV: 'test',
        SENTRY_LOGS_ENABLED: undefined,
      });

      expect(loadLogConfig().sentry?.enabled).toBe(false);
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

      expect(loadLogConfig().sentry?.enabled).toBe(false);
    });

    it('rejects invalid SENTRY_LOGS_ENABLED values', () => {
      setEnv({
        NODE_ENV: 'production',
        SENTRY_LOGS_ENABLED: 'yes',
      });

      expect(() => loadLogConfig()).toThrow(/SENTRY_LOGS_ENABLED/);
    });

    it('falls back to info when SENTRY_LOGS_LEVEL is invalid', () => {
      setEnv({
        NODE_ENV: 'production',
        SENTRY_LOGS_LEVEL: 'verbose',
      });

      expect(loadLogConfig().sentry?.minLevel).toBe('info');
    });
  });
});

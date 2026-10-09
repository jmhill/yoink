import { Writable } from 'node:stream';
import { describe, it, expect } from 'vitest';
import Fastify from 'fastify';
import { createLoggerOptions } from './logger.js';
import type { LogConfig } from '../config/schema.js';

const quietSentry = { enabled: false, minLevel: 'info' } as const;

const logConfig = (overrides: Partial<LogConfig> = {}): LogConfig => ({
  level: 'info',
  pretty: false,
  sentry: quietSentry,
  ...overrides,
});

describe('createLoggerOptions', () => {
  describe('log level configuration', () => {
    it('sets the log level from config', () => {
      const config = logConfig({ level: 'debug' });

      const options = createLoggerOptions(config);

      expect(options.level).toBe('debug');
    });

    it('supports all valid log levels', () => {
      const levels = ['fatal', 'error', 'warn', 'info', 'debug', 'trace'] as const;

      for (const level of levels) {
        const options = createLoggerOptions(logConfig({ level }));
        expect(options.level).toBe(level);
      }
    });
  });

  describe('pretty printing', () => {
    it('configures pino-pretty transport when pretty is true', () => {
      const config = logConfig({ pretty: true });

      const options = createLoggerOptions(config);

      expect(options.transport).toEqual({
        target: 'pino-pretty',
        options: {
          colorize: true,
        },
      });
    });

    it('does not configure transport when pretty is false', () => {
      const config = logConfig();

      const options = createLoggerOptions(config);

      expect(options.transport).toBeUndefined();
    });
  });

  describe('sensitive field redaction', () => {
    it('redacts authorization header', () => {
      const options = createLoggerOptions(logConfig());

      expect(options.redact).toContain('req.headers.authorization');
    });

    it('redacts cookie header', () => {
      const options = createLoggerOptions(logConfig());

      expect(options.redact).toContain('req.headers.cookie');
    });

    it('does not write authorization, cookie, or token values to serialized logs', async () => {
      const lines: string[] = [];
      const stream = new Writable({
        write(chunk, _encoding, callback) {
          lines.push(String(chunk));
          callback();
        },
      });

      // Sentry's pinoIntegration JSON-parses this same serialized line, so
      // redaction here is what keeps secrets out of Sentry Logs. Identity
      // req serializer so Fastify does not strip headers before redact.
      const app = Fastify({
        logger: {
          ...createLoggerOptions(logConfig()),
          stream,
          serializers: {
            req: (req) => ({
              method: req.method,
              headers: req.headers,
            }),
          },
        },
      });
      await app.ready();

      app.log.info(
        {
          req: {
            method: 'GET',
            headers: {
              authorization: 'Bearer tokenId:super-secret-token',
              cookie: 'yoink_session=cookie-secret-value',
            },
          },
        },
        'incoming request'
      );
      await app.close();

      const output = lines.join('');
      expect(output).not.toContain('super-secret-token');
      expect(output).not.toContain('cookie-secret-value');
      expect(output).not.toContain('tokenId:super-secret-token');
      expect(output).toContain('[Redacted]');
      expect(JSON.parse(output)).toMatchObject({
        req: {
          headers: {
            authorization: '[Redacted]',
            cookie: '[Redacted]',
          },
        },
      });
    });
  });
});

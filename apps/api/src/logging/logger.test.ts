import { describe, it, expect } from 'vitest';
import { createLoggerOptions } from './logger.js';
import type { LogConfig } from '../config/schema.js';

describe('createLoggerOptions', () => {
  describe('log level configuration', () => {
    it('sets the log level from config', () => {
      const config: LogConfig = { level: 'debug', pretty: false };

      const options = createLoggerOptions(config);

      expect(options.level).toBe('debug');
    });

    it('supports all valid log levels', () => {
      const levels = ['fatal', 'error', 'warn', 'info', 'debug', 'trace'] as const;

      for (const level of levels) {
        const options = createLoggerOptions({ level, pretty: false });
        expect(options.level).toBe(level);
      }
    });
  });

  describe('pretty printing', () => {
    it('configures pino-pretty transport when pretty is true', () => {
      const config: LogConfig = { level: 'info', pretty: true };

      const options = createLoggerOptions(config);

      expect(options.transport).toEqual({
        target: 'pino-pretty',
        options: {
          colorize: true,
        },
      });
    });

    it('does not configure transport when pretty is false', () => {
      const config: LogConfig = { level: 'info', pretty: false };

      const options = createLoggerOptions(config);

      expect(options.transport).toBeUndefined();
    });
  });

  describe('sensitive field redaction', () => {
    it('redacts authorization header', () => {
      const config: LogConfig = { level: 'info', pretty: false };

      const options = createLoggerOptions(config);

      expect(options.redact).toContain('req.headers.authorization');
    });

    it('redacts cookie header', () => {
      const config: LogConfig = { level: 'info', pretty: false };

      const options = createLoggerOptions(config);

      expect(options.redact).toContain('req.headers.cookie');
    });
  });
});

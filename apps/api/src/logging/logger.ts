import type { PinoLoggerOptions } from 'fastify/types/logger.js';
import type { LogConfig } from '../config/schema.js';

/**
 * Creates Pino logger options for Fastify based on LogConfig.
 *
 * Features:
 * - Configurable log level (fatal, error, warn, info, debug, trace)
 * - Pretty printing for development (pino-pretty transport)
 * - Sensitive field redaction (authorization, cookies)
 */
export const createLoggerOptions = (config: LogConfig): PinoLoggerOptions => {
  return {
    level: config.level,
    transport: config.pretty
      ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
          },
        }
      : undefined,
    redact: ['req.headers.authorization', 'req.headers.cookie'],
  };
};

import type { PinoLoggerOptions } from 'fastify/types/logger.js';
import type { LogConfig } from '../config/schema.js';

export const PINO_REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-api-key"]',
  'req.cookies.session',
  'req.cookies.yoink_session',
] as const;

/**
 * Creates Pino logger options for Fastify based on LogConfig.
 *
 * Features:
 * - Configurable log level (fatal, error, warn, info, debug, trace)
 * - Pretty printing for development (pino-pretty transport)
 * - Sensitive field redaction (authorization, cookies, x-api-key, session)
 *
 * Stdout is unchanged when Sentry Logs are enabled. Sentry's pinoIntegration
 * reads Pino's serialized (already redacted) JSON via diagnostics_channel.
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
    redact: [...PINO_REDACT_PATHS],
  };
};

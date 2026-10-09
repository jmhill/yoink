import * as Sentry from '@sentry/node';
import type { Log } from '@sentry/node';
import type { LogConfig, LogLevel } from '../config/schema.js';

const PINO_LEVELS = ['trace', 'debug', 'info', 'warn', 'error', 'fatal'] as const;

const SENSITIVE_HEADER_KEYS = new Set(['authorization', 'cookie', 'set-cookie']);

export const levelsAtOrAbove = (minLevel: LogLevel): LogLevel[] => {
  const minIndex = PINO_LEVELS.indexOf(minLevel);
  return PINO_LEVELS.slice(minIndex).map((level) => level);
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Recursively replace authorization / cookie values so they cannot reach Sentry
 * even if a log bypasses Pino's path-based redact.
 */
export const redactSensitiveLogValue = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(redactSensitiveLogValue);
  }
  if (!isRecord(value)) {
    return value;
  }

  const redacted: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value)) {
    redacted[key] = SENSITIVE_HEADER_KEYS.has(key.toLowerCase())
      ? '[Redacted]'
      : redactSensitiveLogValue(nested);
  }
  return redacted;
};

export const scrubSentryLog = (log: Log): Log => {
  if (!log.attributes) {
    return log;
  }
  const attributes = redactSensitiveLogValue(log.attributes);
  if (!isRecord(attributes)) {
    return log;
  }
  return { ...log, attributes };
};

type SentryPinoIntegration = ReturnType<typeof Sentry.pinoIntegration>;
type SentryUnhandledRejectionIntegration = ReturnType<
  typeof Sentry.onUnhandledRejectionIntegration
>;

export type SentryInitOptions = {
  dsn: string;
  environment: string;
  tracesSampleRate: number;
  enableLogs: boolean;
  beforeSendLog: typeof scrubSentryLog;
  integrations: Array<SentryUnhandledRejectionIntegration | SentryPinoIntegration>;
};

export const createSentryInitOptions = (options: {
  dsn: string;
  environment: string;
  log: LogConfig;
}): SentryInitOptions => {
  const sentryLogs = options.log.sentry;
  const logsEnabled = sentryLogs?.enabled === true;

  const integrations: SentryInitOptions['integrations'] = [
    Sentry.onUnhandledRejectionIntegration({ mode: 'warn' }),
  ];

  if (logsEnabled && sentryLogs) {
    integrations.push(
      Sentry.pinoIntegration({
        log: { levels: levelsAtOrAbove(sentryLogs.minLevel) },
        // Do not turn Pino lines into Sentry issues — crash reporting stays
        // on setupFastifyErrorHandler / unhandled rejections.
        error: { levels: [] },
      })
    );
  }

  return {
    dsn: options.dsn,
    environment: options.environment,
    tracesSampleRate: 0.1,
    enableLogs: logsEnabled,
    beforeSendLog: scrubSentryLog,
    integrations,
  };
};

export const initSentry = (options: {
  dsn: string | undefined;
  environment: string;
  log: LogConfig;
}): void => {
  if (!options.dsn) {
    return;
  }

  Sentry.init(
    createSentryInitOptions({
      dsn: options.dsn,
      environment: options.environment,
      log: options.log,
    })
  );
};

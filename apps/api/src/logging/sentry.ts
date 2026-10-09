import * as Sentry from '@sentry/node';
import type { Log } from '@sentry/node';
import type { LogConfig, LogLevel, SentryConfig } from '../config/schema.js';
import { LogLevelSchema } from '../config/schema.js';

const SENSITIVE_KEYS = new Set([
  'authorization',
  'cookie',
  'set-cookie',
  'token',
  'apitoken',
  'secret',
  'password',
  'sessionsecret',
  'code',
  'invitecode',
  'credential',
  'attestationobject',
  'clientdatajson',
]);

const BEARER_TOKEN = /Bearer \S+/gi;

export const levelsAtOrAbove = (minLevel: LogLevel): LogLevel[] => {
  const levels = [...LogLevelSchema.options].reverse();
  return levels.slice(levels.indexOf(minLevel));
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const maskBearerTokens = (value: string): string =>
  value.replace(BEARER_TOKEN, 'Bearer [Redacted]');

/**
 * Recursively redact sensitive keys and Bearer tokens so they cannot reach
 * Sentry even if a log bypasses Pino's path-based redact.
 */
export const redactSensitiveLogValue = (value: unknown): unknown => {
  if (typeof value === 'string') {
    return maskBearerTokens(value);
  }
  if (Array.isArray(value)) {
    return value.map(redactSensitiveLogValue);
  }
  if (!isRecord(value)) {
    return value;
  }

  const redacted: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value)) {
    redacted[key] = SENSITIVE_KEYS.has(key.toLowerCase())
      ? '[Redacted]'
      : redactSensitiveLogValue(nested);
  }
  return redacted;
};

export const scrubSentryLog = (log: Log): Log => {
  const message =
    typeof log.message === 'string' ? maskBearerTokens(log.message) : log.message;
  if (!log.attributes) {
    return { ...log, message };
  }
  const attributes = redactSensitiveLogValue(log.attributes);
  if (!isRecord(attributes)) {
    return { ...log, message };
  }
  return { ...log, message, attributes };
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
  sentry: SentryConfig & { dsn: string };
  log: LogConfig;
}): SentryInitOptions => {
  const logsEnabled = options.log.sentry.enabled;

  const integrations: SentryInitOptions['integrations'] = [
    Sentry.onUnhandledRejectionIntegration({ mode: 'warn' }),
  ];

  if (logsEnabled) {
    integrations.push(
      Sentry.pinoIntegration({
        log: { levels: levelsAtOrAbove(options.log.sentry.minLevel) },
        // Do not turn Pino lines into Sentry issues — crash reporting stays
        // on setupFastifyErrorHandler / unhandled rejections.
        error: { levels: [] },
      })
    );
  }

  return {
    dsn: options.sentry.dsn,
    environment: options.sentry.environment,
    tracesSampleRate: 0.1,
    enableLogs: logsEnabled,
    beforeSendLog: scrubSentryLog,
    integrations,
  };
};

export const initSentry = (options: {
  sentry: SentryConfig;
  log: LogConfig;
}): void => {
  if (!options.sentry.dsn) {
    return;
  }

  Sentry.init(
    createSentryInitOptions({
      sentry: { ...options.sentry, dsn: options.sentry.dsn },
      log: options.log,
    })
  );
};

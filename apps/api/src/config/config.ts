import {
  type AppConfig,
  type DatabaseConfig,
  type AdminConfig,
  type RateLimitConfig,
  type LogLevel,
  type LogConfig,
  LogLevelSchema,
} from './schema.js';

/**
 * Load admin configuration from environment variables.
 * Returns undefined if ADMIN_PASSWORD is not set.
 */
const loadAdminConfig = async (): Promise<AdminConfig | undefined> => {
  const password = process.env.ADMIN_PASSWORD;
  const sessionSecret = process.env.SESSION_SECRET;

  if (!password) {
    return undefined;
  }

  // Ensure SESSION_SECRET is set in production
  let secret = sessionSecret;
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('SESSION_SECRET must be set in production');
    }
    // For dev/test only - generate a cryptographically random secret
    const crypto = await import('node:crypto');
    console.warn('WARNING: Using auto-generated session secret. Set SESSION_SECRET env var.');
    secret = crypto.randomBytes(32).toString('hex');
  }

  return { password, sessionSecret: secret };
};

/**
 * Load rate limit configuration from environment variables.
 * RATE_LIMIT_ENABLED=false disables rate limiting (for testing).
 */
const loadRateLimitConfig = (): RateLimitConfig => {
  const enabled = process.env.RATE_LIMIT_ENABLED !== 'false';
  return {
    enabled,
    globalMax: parseInt(process.env.RATE_LIMIT_GLOBAL_MAX ?? '100', 10),
    globalTimeWindow: process.env.RATE_LIMIT_GLOBAL_WINDOW ?? '1 minute',
    adminLoginMax: parseInt(process.env.RATE_LIMIT_ADMIN_LOGIN_MAX ?? '5', 10),
    adminLoginTimeWindow: process.env.RATE_LIMIT_ADMIN_LOGIN_WINDOW ?? '15 minutes',
  };
};

/**
 * Parse log level from environment variable.
 * Returns undefined if invalid, allowing default to be used.
 */
const parseLogLevel = (value: string | undefined): LogLevel | undefined => {
  if (!value) return undefined;
  const result = LogLevelSchema.safeParse(value.toLowerCase());
  return result.success ? result.data : undefined;
};

/**
 * Load logging configuration from environment variables.
 * - LOG_LEVEL: fatal, error, warn, info, debug, trace (default: info in prod, debug in dev)
 * - Pretty printing auto-enabled in development
 */
const loadLogConfig = (): LogConfig => {
  const isProduction = process.env.NODE_ENV === 'production';
  const defaultLevel: LogLevel = isProduction ? 'info' : 'debug';

  return {
    level: parseLogLevel(process.env.LOG_LEVEL) ?? defaultLevel,
    pretty: !isProduction,
  };
};

/**
 * Load database configuration from environment variables.
 *
 * Priority:
 * 1. TURSO_DATABASE_URL → Turso cloud database
 * 2. DB_PATH → Local file-based LibSQL
 * 3. Default → ./data/captures.db (file)
 */
const loadDatabaseConfig = (): DatabaseConfig => {
  const tursoUrl = process.env.TURSO_DATABASE_URL;

  if (tursoUrl) {
    return {
      type: 'turso',
      url: tursoUrl,
      authToken: process.env.TURSO_AUTH_TOKEN,
    };
  }

  return {
    type: 'file',
    path: process.env.DB_PATH ?? './data/captures.db',
  };
};

/**
 * Load application configuration from environment variables.
 * Returns production-ready defaults (file-based LibSQL, system clock, uuid, bcrypt).
 */
export const loadConfig = async (): Promise<AppConfig> => {
  return {
    server: {
      port: parseInt(process.env.PORT ?? '3000', 10),
      host: process.env.HOST ?? '0.0.0.0',
    },
    database: loadDatabaseConfig(),
    infrastructure: {
      clock: { type: 'system' },
      idGenerator: { type: 'uuid' },
      passwordHasher: { type: 'bcrypt' },
    },
    seedToken: process.env.SEED_TOKEN,
    admin: await loadAdminConfig(),
    rateLimit: loadRateLimitConfig(),
    log: loadLogConfig(),
  };
};

/**
 * Get the database path from config.
 * Returns the path for file databases, ':memory:' for in-memory, or the Turso URL.
 */
export const getDatabasePath = (config: DatabaseConfig): string => {
  switch (config.type) {
    case 'file':
      return config.path;
    case 'turso':
      return config.url;
    case 'memory':
      return ':memory:';
  }
};

// Re-export types for convenience
export type { AppConfig, DatabaseConfig } from './schema.js';

import {
  type AppConfig,
  type DatabaseConfig,
  type AdminConfig,
  type RateLimitConfig,
  type LogLevel,
  type LogConfig,
  type WebAuthnConfig,
  type CookieConfig,
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
    authLoginMax: parseInt(process.env.RATE_LIMIT_AUTH_LOGIN_MAX ?? '10', 10),
    authLoginTimeWindow: process.env.RATE_LIMIT_AUTH_LOGIN_WINDOW ?? '15 minutes',
    signupMax: parseInt(process.env.RATE_LIMIT_SIGNUP_MAX ?? '5', 10),
    signupTimeWindow: process.env.RATE_LIMIT_SIGNUP_WINDOW ?? '1 hour',
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
 * Load WebAuthn configuration from environment variables.
 * Returns undefined if required variables are not set.
 */
const loadWebAuthnConfig = (): WebAuthnConfig | undefined => {
  const rpId = process.env.WEBAUTHN_RP_ID;
  const rpName = process.env.WEBAUTHN_RP_NAME;
  const origin = process.env.WEBAUTHN_ORIGIN;
  const challengeSecret = process.env.WEBAUTHN_CHALLENGE_SECRET;

  // All fields are required
  if (!rpId || !rpName || !origin || !challengeSecret) {
    return undefined;
  }

  return {
    rpId,
    rpName,
    origin,
    challengeSecret,
  };
};

/**
 * Load cookie configuration from environment variables.
 * 
 * COOKIE_SECURE controls whether cookies require HTTPS:
 * - 'true': Secure cookies (requires HTTPS)
 * - 'false': Insecure cookies (allows HTTP, for testing)
 * - Not set: Defaults based on NODE_ENV (production = secure)
 * 
 * Invalid values will throw an error to prevent misconfiguration.
 */
const loadCookieConfig = (): CookieConfig => {
  const cookieSecureEnv = process.env.COOKIE_SECURE;
  const isProduction = process.env.NODE_ENV === 'production';
  
  let secure: boolean;
  
  if (cookieSecureEnv !== undefined) {
    // Validate explicit value
    if (cookieSecureEnv !== 'true' && cookieSecureEnv !== 'false') {
      throw new Error(
        `Invalid COOKIE_SECURE value: "${cookieSecureEnv}". Must be "true" or "false".`
      );
    }
    secure = cookieSecureEnv === 'true';
    
    // Warn if running insecure in production
    if (!secure && isProduction) {
      console.warn(
        'WARNING: COOKIE_SECURE=false in production. ' +
        'Cookies will be sent over HTTP, which is insecure.'
      );
    }
  } else {
    // Default based on NODE_ENV
    secure = isProduction;
  }
  
  // Validate and parse maxAge
  const maxAgeStr = process.env.COOKIE_MAX_AGE ?? String(7 * 24 * 60 * 60);
  const maxAge = parseInt(maxAgeStr, 10);
  if (isNaN(maxAge) || maxAge <= 0) {
    throw new Error(
      `Invalid COOKIE_MAX_AGE value: "${maxAgeStr}". Must be a positive integer.`
    );
  }
  
  return {
    secure,
    sessionName: process.env.COOKIE_SESSION_NAME ?? 'yoink_session',
    maxAge,
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
    webauthn: loadWebAuthnConfig(),
    cookie: loadCookieConfig(),
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

import { type AppConfig, type DatabaseConfig, type AdminConfig } from './schema.js';

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
 * Load application configuration from environment variables.
 * Returns production-ready defaults (sqlite, system clock, uuid, bcrypt).
 */
export const loadConfig = async (): Promise<AppConfig> => {
  return {
    server: {
      port: parseInt(process.env.PORT ?? '3000', 10),
      host: process.env.HOST ?? '0.0.0.0',
    },
    database: {
      type: 'sqlite',
      path: process.env.DB_PATH ?? './data/captures.db',
    },
    infrastructure: {
      clock: { type: 'system' },
      idGenerator: { type: 'uuid' },
      passwordHasher: { type: 'bcrypt' },
    },
    seedToken: process.env.SEED_TOKEN,
    admin: await loadAdminConfig(),
  };
};

/**
 * Get the database path from config.
 * Returns the path for sqlite databases, or ':memory:' for in-memory databases.
 */
export const getDatabasePath = (config: DatabaseConfig): string => {
  return config.type === 'sqlite' ? config.path : ':memory:';
};

// Re-export types for convenience
export type { AppConfig, DatabaseConfig } from './schema.js';

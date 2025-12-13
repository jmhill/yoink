import { type AppConfig, type DatabaseConfig, type AdminConfig } from './schema.js';

/**
 * Load admin configuration from environment variables.
 * Returns undefined if ADMIN_PASSWORD is not set.
 */
const loadAdminConfig = (): AdminConfig | undefined => {
  const password = process.env.ADMIN_PASSWORD;
  const sessionSecret = process.env.SESSION_SECRET;

  if (!password) {
    return undefined;
  }

  // Generate a default session secret if not provided (32 chars from password hash)
  // In production, SESSION_SECRET should always be explicitly set
  const secret = sessionSecret ?? `default-session-secret-${password}`.slice(0, 32).padEnd(32, 'x');

  return { password, sessionSecret: secret };
};

/**
 * Load application configuration from environment variables.
 * Returns production-ready defaults (sqlite, system clock, uuid, bcrypt).
 */
export const loadConfig = (): AppConfig => {
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
    admin: loadAdminConfig(),
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

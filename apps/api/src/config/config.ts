import { type AppConfig, type DatabaseConfig } from './schema.js';

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

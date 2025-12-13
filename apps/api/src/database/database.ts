import { DatabaseSync } from 'node:sqlite';
import type { DatabaseConfig } from '../config/schema.js';

export type Database = {
  db: DatabaseSync;
  close: () => void;
};

/**
 * Create a database connection based on the provided configuration.
 * Handles both SQLite file databases and in-memory databases.
 */
export const createDatabase = (config: DatabaseConfig): Database => {
  const path = config.type === 'sqlite' ? config.path : ':memory:';
  const db = new DatabaseSync(path);

  // Enable foreign key constraints (off by default in SQLite)
  db.exec('PRAGMA foreign_keys = ON');

  return {
    db,
    close: () => db.close(),
  };
};

import type { DatabaseSync } from 'node:sqlite';

export type Migration = {
  version: number;
  name: string;
  up: (db: DatabaseSync) => void;
};

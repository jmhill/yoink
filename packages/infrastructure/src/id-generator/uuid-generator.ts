import { randomUUID } from 'node:crypto';
import type { IdGenerator } from './id-generator.js';

export const createUuidGenerator = (): IdGenerator => ({
  generate: () => randomUUID(),
});

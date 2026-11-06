import { describe, it, expect, afterEach } from 'vitest';
import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { createDatabase } from './database.js';

describe('createDatabase', () => {
  let cleanupPath: string | undefined;

  afterEach(async () => {
    if (cleanupPath) {
      rmSync(cleanupPath, { recursive: true, force: true });
      cleanupPath = undefined;
    }
  });

  it('creates the parent directory when opening a file database', async () => {
    const root = join(tmpdir(), `yoink-db-${randomUUID()}`);
    cleanupPath = root;
    const path = join(root, 'nested', 'captures.db');

    expect(existsSync(join(root, 'nested'))).toBe(false);

    const db = createDatabase({ type: 'file', path });
    expect(existsSync(join(root, 'nested'))).toBe(true);

    await db.close();
  });
});

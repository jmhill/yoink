import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createBareTestDatabase } from '../test-utils.js';
import { runMigrations } from '../migrator.js';
import { migrations } from './index.js';
import type { Database } from '../types.js';

const before46 = migrations.filter((migration) => migration.version < 46);
const from46 = migrations.filter((migration) => migration.version >= 46);

describe('Migration 46: backfill notes_settings', () => {
  let db: Database;

  beforeEach(() => {
    db = createBareTestDatabase();
  });

  afterEach(async () => {
    await db.close();
  });

  it('copies a non-null bot id and leaves a null organization with no settings row', async () => {
    await runMigrations(db, before46);
    await db.batch([
      {
        sql: `
          INSERT INTO organizations (id, name, created_at, notes_mirror_bot_user_id)
          VALUES (?, ?, ?, ?)
        `,
        args: ['org-bot', 'Has bot', '2026-11-10T00:00:00.000Z', 'bot-user-1'],
      },
      {
        sql: `
          INSERT INTO organizations (id, name, created_at, notes_mirror_bot_user_id)
          VALUES (?, ?, ?, ?)
        `,
        args: ['org-null', 'No bot', '2026-11-10T00:00:00.000Z', null],
      },
    ]);

    await runMigrations(db, from46);

    const settings = await db.execute({
      sql: `
        SELECT organization_id, notes_mirror_bot_user_id
        FROM notes_settings
        ORDER BY organization_id
      `,
    });
    expect(settings.rows).toEqual([
      { organization_id: 'org-bot', notes_mirror_bot_user_id: 'bot-user-1' },
    ]);

    const stored = await db.execute({
      sql: `
        SELECT id, notes_mirror_bot_user_id
        FROM organizations
        ORDER BY id
      `,
    });
    expect(stored.rows).toEqual([
      { id: 'org-bot', notes_mirror_bot_user_id: 'bot-user-1' },
      { id: 'org-null', notes_mirror_bot_user_id: null },
    ]);
  });
});

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { okAsync } from 'neverthrow';
import { createTestDatabase, type Database } from '../../../../platform/database/test-utils.js';
import { NOTES_MIRROR_BOT_NAME } from '../../domain/rules/mirror-bot.js';
import type { LoadNamedAgent } from '../../application/ports.js';
import {
  designateNotesMirrorBotFromSqlite,
  loadNotesMirrorBotFromSqlite,
} from './load-notes-mirror-bot.js';

const at = '2026-11-11T00:00:00.000Z';

describe('loadNotesMirrorBotFromSqlite', () => {
  let db: Database;

  beforeEach(async () => {
    db = await createTestDatabase();
    await db.execute({
      sql: `
        INSERT INTO organizations (id, name, created_at, notes_mirror_bot_user_id)
        VALUES (?, ?, ?, ?)
      `,
      args: ['org-1', 'Org', at, 'old-column-bot'],
    });
  });

  afterEach(async () => {
    await db.close();
  });

  const settingsId = async (): Promise<string | null> => {
    const result = await db.execute({
      sql: `SELECT notes_mirror_bot_user_id FROM notes_settings WHERE organization_id = ?`,
      args: ['org-1'],
    });
    const value = result.rows[0]?.notes_mirror_bot_user_id;
    return typeof value === 'string' ? value : null;
  };

  const organizationColumn = async (): Promise<unknown> => {
    const result = await db.execute({
      sql: `SELECT notes_mirror_bot_user_id FROM organizations WHERE id = ?`,
      args: ['org-1'],
    });
    return result.rows[0]?.notes_mirror_bot_user_id;
  };

  it('uses the stored id, then the env fallback, then the named agent', async () => {
    await db.execute({
      sql: `INSERT INTO notes_settings (organization_id, notes_mirror_bot_user_id) VALUES (?, ?)`,
      args: ['org-1', 'stored-bot'],
    });
    let namedCalls = 0;
    const loadNamedAgent: LoadNamedAgent = () => {
      namedCalls += 1;
      return okAsync('named-bot');
    };

    const stored = await loadNotesMirrorBotFromSqlite(db, 'env-bot', loadNamedAgent)('org-1');
    expect(stored._unsafeUnwrap()).toBe('stored-bot');
    expect(namedCalls).toBe(0);

    await db.execute({ sql: `DELETE FROM notes_settings WHERE organization_id = ?`, args: ['org-1'] });
    const fromEnv = await loadNotesMirrorBotFromSqlite(db, 'env-bot', loadNamedAgent)('org-1');
    expect(fromEnv._unsafeUnwrap()).toBe('env-bot');
    expect(namedCalls).toBe(0);
    expect(await settingsId()).toBeNull();
    expect(await organizationColumn()).toBe('old-column-bot');

    const fromName = await loadNotesMirrorBotFromSqlite(db, null, loadNamedAgent)('org-1');
    expect(fromName._unsafeUnwrap()).toBe('named-bot');
    expect(namedCalls).toBe(1);
    expect(await settingsId()).toBe('named-bot');
    expect(await organizationColumn()).toBe('old-column-bot');

    const again = await loadNotesMirrorBotFromSqlite(db, null, loadNamedAgent)('org-1');
    expect(again._unsafeUnwrap()).toBe('named-bot');
    expect(namedCalls).toBe(1);
  });

  it('returns null when nothing resolves and leaves the old column unread', async () => {
    const loadNamedAgent: LoadNamedAgent = () => okAsync(null);
    const resolved = await loadNotesMirrorBotFromSqlite(db, null, loadNamedAgent)('org-1');
    expect(resolved._unsafeUnwrap()).toBeNull();
    expect(await settingsId()).toBeNull();
    expect(await organizationColumn()).toBe('old-column-bot');
  });

  it('stores a designation on notes_settings and does not replace a stored id', async () => {
    const designate = designateNotesMirrorBotFromSqlite(db);
    await designate({
      organizationId: 'org-1',
      userId: 'first-bot',
      name: 'Someone else',
    });
    expect(await settingsId()).toBeNull();

    await designate({
      organizationId: 'org-1',
      userId: 'first-bot',
      name: NOTES_MIRROR_BOT_NAME,
    });
    expect(await settingsId()).toBe('first-bot');

    await designate({
      organizationId: 'org-1',
      userId: 'second-bot',
      name: NOTES_MIRROR_BOT_NAME,
    });
    expect(await settingsId()).toBe('first-bot');
    expect(await organizationColumn()).toBe('old-column-bot');
  });
});

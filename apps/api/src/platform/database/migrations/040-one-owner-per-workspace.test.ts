import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createBareTestDatabase } from '../test-utils.js';
import { runMigrations } from '../migrator.js';
import { migrations } from './index.js';
import type { Database } from '../types.js';

const upTo = (version: number) => migrations.filter((migration) => migration.version <= version);

const seedWorkspace = async (
  db: Database,
  orgId: string,
  userIds: string[]
): Promise<void> => {
  const now = '2024-01-01T00:00:00.000Z';
  await db.execute({
    sql: `INSERT INTO organizations (id, name, created_at) VALUES (?, ?, ?)`,
    args: [orgId, `Org ${orgId}`, now],
  });
  for (const userId of userIds) {
    await db.execute({
      sql: `INSERT INTO users (id, email, created_at) VALUES (?, ?, ?)`,
      args: [userId, `${userId}@test.local`, now],
    });
  }
};

const insertMembership = async (
  db: Database,
  id: string,
  userId: string,
  orgId: string,
  role: 'owner' | 'admin' | 'member'
): Promise<void> => {
  await db.execute({
    sql: `INSERT INTO organization_memberships (id, user_id, organization_id, role, is_personal_org, joined_at) VALUES (?, ?, ?, ?, 0, ?)`,
    args: [id, userId, orgId, role, '2024-01-01T00:00:00.000Z'],
  });
};

describe('Migration 40: one owner per workspace', () => {
  let db: Database;

  beforeEach(() => {
    db = createBareTestDatabase();
  });

  afterEach(async () => {
    await db.close();
  });

  it('succeeds with zero owners and with one owner per org', async () => {
    await runMigrations(db, upTo(39));
    await seedWorkspace(db, 'org-zero', ['user-zero']);
    await seedWorkspace(db, 'org-one', ['user-one']);
    await insertMembership(db, 'm-member', 'user-zero', 'org-zero', 'member');
    await insertMembership(db, 'm-owner', 'user-one', 'org-one', 'owner');

    const result = await runMigrations(db, migrations);
    expect(result.applied).toContain('one_owner_per_workspace');
  });

  it('refuses a second owner insert after the index exists', async () => {
    await runMigrations(db, migrations);
    await seedWorkspace(db, 'org-one', ['user-one', 'user-two']);
    await insertMembership(db, 'm-owner', 'user-one', 'org-one', 'owner');

    await expect(
      insertMembership(db, 'm-second', 'user-two', 'org-one', 'owner')
    ).rejects.toThrow();
  });

  it('fails cleanly on pre-existing duplicate owners and lists the org ids', async () => {
    await runMigrations(db, upTo(39));
    await seedWorkspace(db, 'dup-org-a', ['user-a1', 'user-a2']);
    await seedWorkspace(db, 'dup-org-b', ['user-b1', 'user-b2']);
    await insertMembership(db, 'm-a1', 'user-a1', 'dup-org-a', 'owner');
    await insertMembership(db, 'm-a2', 'user-a2', 'dup-org-a', 'owner');
    await insertMembership(db, 'm-b1', 'user-b1', 'dup-org-b', 'owner');
    await insertMembership(db, 'm-b2', 'user-b2', 'dup-org-b', 'owner');

    await expect(runMigrations(db, migrations)).rejects.toThrow(
      /these workspaces have more than one owner: .*dup-org-a.*dup-org-b|these workspaces have more than one owner: .*dup-org-b.*dup-org-a/
    );

    const applied = await db.execute({
      sql: `SELECT name FROM _migrations WHERE name = 'one_owner_per_workspace'`,
    });
    expect(applied.rows).toHaveLength(0);

    const owners = await db.execute({
      sql: `SELECT COUNT(*) AS n FROM organization_memberships WHERE organization_id = 'dup-org-a' AND role = 'owner'`,
    });
    expect(Number(owners.rows[0]?.n)).toBe(2);
  });
});

import type { Database } from './types.js';

/**
 * Result of seeding test data, containing IDs of created entities.
 * Useful for test assertions and debugging.
 */
export type SeedResult = {
  organizationIds: string[];
  userIds: string[];
  captureIds: string[];
};

/**
 * Check if a column exists in a table.
 */
const hasColumn = async (
  db: Database,
  tableName: string,
  columnName: string
): Promise<boolean> => {
  const result = await db.execute({
    sql: `PRAGMA table_info(${tableName})`,
  });
  return result.rows.some((row) => row.name === columnName);
};

/**
 * Seed minimal synthetic data that exercises all foreign key relationships.
 *
 * This creates a realistic database state for testing migrations that
 * modify tables with FK constraints. The data is minimal but covers
 * all the relationships:
 *
 * - organizations (2)
 * - users (2)
 * - organization_memberships (user <-> org)
 * - api_tokens (user, org)
 * - passkey_credentials (user)
 * - user_sessions (user, org)
 * - invitations (org, user)
 * - captures (org, user)
 * - tasks (org, user, capture)
 *
 * The seeder is schema-aware and adapts to the current migration state.
 * For example, it includes organization_id when seeding users if that
 * column still exists (before migration 20).
 */
export const seedMigrationTestData = async (
  db: Database
): Promise<SeedResult> => {
  const now = new Date().toISOString();
  const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  // 1. Create organizations
  const orgIds = ['test-org-1', 'test-org-2'];
  for (const id of orgIds) {
    await db.execute({
      sql: `INSERT INTO organizations (id, name, created_at) VALUES (?, ?, ?)`,
      args: [id, `Test Org ${id}`, now],
    });
  }

  // 2. Create users
  // Check if organization_id column exists (removed in migration 20)
  const usersHasOrgId = await hasColumn(db, 'users', 'organization_id');
  const userIds = ['test-user-1', 'test-user-2'];
  
  for (let i = 0; i < userIds.length; i++) {
    const id = userIds[i];
    const orgId = orgIds[i]; // User 1 -> Org 1, User 2 -> Org 2
    
    if (usersHasOrgId) {
      await db.execute({
        sql: `INSERT INTO users (id, organization_id, email, created_at) VALUES (?, ?, ?, ?)`,
        args: [id, orgId, `${id}@test.local`, now],
      });
    } else {
      await db.execute({
        sql: `INSERT INTO users (id, email, created_at) VALUES (?, ?, ?)`,
        args: [id, `${id}@test.local`, now],
      });
    }
  }

  // 3. Create organization memberships
  // User 1 owns org 1, is member of org 2
  await db.execute({
    sql: `INSERT INTO organization_memberships (id, user_id, organization_id, role, is_personal_org, joined_at) VALUES (?, ?, ?, ?, ?, ?)`,
    args: ['membership-1', 'test-user-1', 'test-org-1', 'owner', 1, now],
  });
  await db.execute({
    sql: `INSERT INTO organization_memberships (id, user_id, organization_id, role, is_personal_org, joined_at) VALUES (?, ?, ?, ?, ?, ?)`,
    args: ['membership-2', 'test-user-1', 'test-org-2', 'member', 0, now],
  });
  // User 2 owns org 2
  await db.execute({
    sql: `INSERT INTO organization_memberships (id, user_id, organization_id, role, is_personal_org, joined_at) VALUES (?, ?, ?, ?, ?, ?)`,
    args: ['membership-3', 'test-user-2', 'test-org-2', 'owner', 1, now],
  });

  // 4. Create API tokens (requires user_id and organization_id after migration 19)
  await db.execute({
    sql: `INSERT INTO api_tokens (id, user_id, token_hash, name, created_at, organization_id) VALUES (?, ?, ?, ?, ?, ?)`,
    args: ['token-1', 'test-user-1', 'hash123', 'Test Token', now, 'test-org-1'],
  });

  // 5. Create passkey credentials
  await db.execute({
    sql: `INSERT INTO passkey_credentials (id, user_id, public_key, counter, device_type, backed_up, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args: ['passkey-1', 'test-user-1', 'publickey123', 0, 'multiDevice', 1, now],
  });

  // 6. Create user sessions
  await db.execute({
    sql: `INSERT INTO user_sessions (id, user_id, current_organization_id, created_at, expires_at, last_active_at) VALUES (?, ?, ?, ?, ?, ?)`,
    args: ['session-1', 'test-user-1', 'test-org-1', now, futureDate, now],
  });

  // 7. Create invitations
  // One with invited_by_user_id set, one without (admin-created)
  await db.execute({
    sql: `INSERT INTO invitations (id, code, email, organization_id, invited_by_user_id, role, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    args: ['invitation-1', 'code123', 'invite@test.local', 'test-org-1', 'test-user-1', 'member', futureDate, now],
  });
  await db.execute({
    sql: `INSERT INTO invitations (id, code, email, organization_id, invited_by_user_id, role, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    args: ['invitation-2', 'code456', 'admin-invite@test.local', 'test-org-2', null, 'admin', futureDate, now],
  });

  // 8. Create captures
  const captureIds = ['capture-1', 'capture-2'];
  await db.execute({
    sql: `INSERT INTO captures (id, organization_id, created_by_id, content, status, captured_at) VALUES (?, ?, ?, ?, ?, ?)`,
    args: ['capture-1', 'test-org-1', 'test-user-1', 'Test capture content', 'inbox', now],
  });
  await db.execute({
    sql: `INSERT INTO captures (id, organization_id, created_by_id, content, status, captured_at) VALUES (?, ?, ?, ?, ?, ?)`,
    args: ['capture-2', 'test-org-2', 'test-user-2', 'Another capture', 'inbox', now],
  });

  // 9. Create tasks
  // One with capture_id, one without
  await db.execute({
    sql: `INSERT INTO tasks (id, organization_id, created_by_id, title, capture_id, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
    args: ['task-1', 'test-org-1', 'test-user-1', 'Test task from capture', 'capture-1', now],
  });
  await db.execute({
    sql: `INSERT INTO tasks (id, organization_id, created_by_id, title, capture_id, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
    args: ['task-2', 'test-org-1', 'test-user-1', 'Standalone task', null, now],
  });

  return {
    organizationIds: orgIds,
    userIds,
    captureIds,
  };
};

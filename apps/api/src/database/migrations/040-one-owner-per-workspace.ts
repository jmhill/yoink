import type { Migration } from '../types.js';

/**
 * At most one owner per workspace.
 *
 * Zero-owner workspaces stay valid (the index only forbids a second owner).
 * If any workspace already has two or more owners, this migration stops and
 * lists those organization ids — it does not auto-demote anyone.
 */
export const migration: Migration = {
  version: 40,
  name: 'one_owner_per_workspace',
  up: async (db) => {
    const duplicates = await db.execute({
      sql: `
        SELECT organization_id, COUNT(*) AS owner_count
        FROM organization_memberships
        WHERE role = 'owner'
        GROUP BY organization_id
        HAVING COUNT(*) > 1
      `,
    });

    if (duplicates.rows.length > 0) {
      const orgIds = duplicates.rows.map((row) => String(row.organization_id));
      throw new Error(
        `Cannot create one-owner index: these workspaces have more than one owner: ${orgIds.join(', ')}. A person must resolve the duplicates before this migration can run.`
      );
    }

    await db.execute({
      sql: `CREATE UNIQUE INDEX idx_memberships_one_owner ON organization_memberships(organization_id) WHERE role = 'owner'`,
    });
  },
};

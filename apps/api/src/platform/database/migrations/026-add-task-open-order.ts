import type { Migration } from '../types.js';

/**
 * Adds an integer open-order index per pile (that listId, or unlisted).
 * Existing rows get a stable order by created_at so production data isn't unordered.
 */
export const migration: Migration = {
  version: 26,
  name: 'add_task_open_order',
  up: async (db) => {
    await db.execute({
      sql: `ALTER TABLE tasks ADD COLUMN open_order INTEGER`,
    });
    await db.execute({
      sql: `CREATE INDEX IF NOT EXISTS idx_tasks_open_order
            ON tasks(organization_id, list_id, open_order)`,
    });

    const existing = await db.execute({
      sql: `
        SELECT id, organization_id, list_id, created_at
        FROM tasks
        WHERE deleted_at IS NULL
        ORDER BY organization_id ASC, list_id ASC, created_at ASC, id ASC
      `,
    });

    const nextIndexByPile = new Map<string, number>();
    const updates: { sql: string; args: unknown[] }[] = [];

    for (const row of existing.rows) {
      const organizationId = String(row.organization_id);
      const listId = row.list_id == null ? '' : String(row.list_id);
      const pileKey = `${organizationId}:${listId}`;
      const openOrder = nextIndexByPile.get(pileKey) ?? 0;
      nextIndexByPile.set(pileKey, openOrder + 1);
      updates.push({
        sql: `UPDATE tasks SET open_order = ? WHERE id = ?`,
        args: [openOrder, row.id],
      });
    }

    if (updates.length > 0) {
      await db.batch(updates, 'write');
    }
  },
};

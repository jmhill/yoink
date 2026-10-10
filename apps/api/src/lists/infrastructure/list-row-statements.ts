import type { NamedList } from '@yoink/api-contracts';
import type { SqlQuery } from '../../shared/change-log/infrastructure/sql.js';

export const insertListQuery = (list: NamedList): SqlQuery => ({
  sql: `
    INSERT INTO lists (
      id, organization_id, created_by_id, name, created_at
    ) VALUES (?, ?, ?, ?, ?)
  `,
  args: [list.id, list.organizationId, list.createdById, list.name, list.createdAt],
});

export const updateListNameQuery = (id: string, organizationId: string, name: string): SqlQuery => ({
  sql: `
    UPDATE lists
    SET name = ?
    WHERE id = ? AND organization_id = ?
  `,
  args: [name, id, organizationId],
});

export const removeListQuery = (id: string, organizationId: string): SqlQuery => ({
  sql: `DELETE FROM lists WHERE id = ? AND organization_id = ?`,
  args: [id, organizationId],
});

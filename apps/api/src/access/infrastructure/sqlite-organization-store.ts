import type { Database } from '../../database/types.js';
import { err, errAsync, ok, okAsync, Result, ResultAsync } from 'neverthrow';
import { z } from 'zod';
import type { Organization } from '../domain/organization.js';
import type { OrganizationStore } from '../domain/organization-store.js';
import {
  organizationStorageError,
  type OrganizationStorageError,
} from '../domain/organization-errors.js';

const OrganizationRowSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  created_at: z.string().datetime(),
});

const organizationFromUnknown = (
  row: Record<string, unknown>
): Result<Organization, OrganizationStorageError> => {
  const parsed = OrganizationRowSchema.safeParse(row);
  if (!parsed.success) {
    return err(organizationStorageError('Failed to parse organization row'));
  }
  return ok({
    id: parsed.data.id,
    name: parsed.data.name,
    createdAt: parsed.data.created_at,
  });
};

const parseOrganizationRow = (
  row: Record<string, unknown> | undefined
): Result<Organization | null, OrganizationStorageError> => {
  if (!row) {
    return ok(null);
  }
  return organizationFromUnknown(row);
};

const parseOrganizationRows = (
  rows: Record<string, unknown>[]
): Result<Organization[], OrganizationStorageError> => Result.combine(rows.map(organizationFromUnknown));

/**
 * Validates that the required database schema exists.
 * Throws an error if migrations have not been run.
 */
const validateSchema = async (db: Database): Promise<void> => {
  const result = await db.execute({
    sql: `SELECT name FROM sqlite_master WHERE type='table' AND name='organizations'`,
  });

  if (result.rows.length === 0) {
    throw new Error(
      'OrganizationStore requires "organizations" table. Ensure migrations have been run before starting the application.'
    );
  }
};

export const createSqliteOrganizationStore = async (
  db: Database
): Promise<OrganizationStore> => {
  await validateSchema(db);

  return {
    save: (organization: Organization): ResultAsync<void, OrganizationStorageError> => {
      return ResultAsync.fromPromise(
        db.execute({
          sql: `
            INSERT INTO organizations (id, name, created_at)
            VALUES (?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET name = excluded.name
          `,
          args: [organization.id, organization.name, organization.createdAt],
        }),
        (error) => organizationStorageError('Failed to save organization', error)
      ).map(() => undefined);
    },

    findById: (id: string): ResultAsync<Organization | null, OrganizationStorageError> => {
      return ResultAsync.fromPromise(
        db.execute({
          sql: `SELECT * FROM organizations WHERE id = ?`,
          args: [id],
          access: 'read',
        }),
        (error) => organizationStorageError('Failed to find organization', error)
      ).andThen((result) => {
        const parsed = parseOrganizationRow(result.rows[0]);
        return parsed.isOk() ? okAsync(parsed.value) : errAsync(parsed.error);
      });
    },

    findAll: (): ResultAsync<Organization[], OrganizationStorageError> => {
      return ResultAsync.fromPromise(
        db.execute({
          sql: `SELECT * FROM organizations ORDER BY created_at DESC`,
        }),
        (error) => organizationStorageError('Failed to find all organizations', error)
      ).andThen((result) => {
        const parsed = parseOrganizationRows(result.rows);
        return parsed.isOk() ? okAsync(parsed.value) : errAsync(parsed.error);
      });
    },
  };
};

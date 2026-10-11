import { err, errAsync, ok, okAsync, Result, ResultAsync } from 'neverthrow';
import { z } from 'zod';
import { ImportProjectSchema } from '@yoink/api-contracts';
import type { Database } from '../../database/types.js';
import { parseJson } from '../../shared/infrastructure/parse-json.js';
import { storageError, type StorageError } from '../domain/project-errors.js';
import type { ProjectImportRecord } from '../domain/project-import.js';

const stagedImportPayloadSchema = z.object({
  projects: z.array(ImportProjectSchema),
});

const ImportRowSchema = z.object({
  id: z.string().min(1),
  organization_id: z.string().min(1),
  created_by: z.string().min(1),
  created_at: z.string().min(1),
  status: z.enum(['pending', 'applied', 'discarded']),
  payload_json: z.string(),
  decided_by: z.string().nullable().optional(),
  decided_at: z.string().nullable().optional(),
});

const parsePayload = (raw: string): Result<ProjectImportRecord['projects'], StorageError> => {
  const decoded = parseJson(raw);
  if (decoded.isErr()) {
    return err(storageError('Invalid import payload JSON', decoded.error));
  }
  const parsed = stagedImportPayloadSchema.safeParse(decoded.value);
  if (!parsed.success) {
    return err(storageError('Invalid import payload', parsed.error));
  }
  return ok(parsed.data.projects);
};

const parseImportRow = (
  row: Record<string, unknown>
): Result<ProjectImportRecord, StorageError> => {
  const parsed = ImportRowSchema.safeParse(row);
  if (!parsed.success) {
    return err(storageError('Invalid import row', parsed.error));
  }
  const projects = parsePayload(parsed.data.payload_json);
  if (projects.isErr()) {
    return err(projects.error);
  }
  return ok({
    id: parsed.data.id,
    organizationId: parsed.data.organization_id,
    createdById: parsed.data.created_by,
    createdAt: parsed.data.created_at,
    status: parsed.data.status,
    projects: projects.value,
    decidedById: parsed.data.decided_by ?? null,
    decidedAt: parsed.data.decided_at ?? null,
  });
};

export type SqliteImportStore = {
  insert: (record: ProjectImportRecord) => ResultAsync<void, StorageError>;
  findById: (id: string) => ResultAsync<ProjectImportRecord | null, StorageError>;
  listPending: (organizationId: string) => ResultAsync<ProjectImportRecord[], StorageError>;
};

export const createSqliteImportStore = (db: Database): SqliteImportStore => ({
  insert: (record) =>
    ResultAsync.fromPromise(
      db.execute({
        sql: `
          INSERT INTO project_imports (
            id, organization_id, created_by, created_at, status, payload_json,
            decided_by, decided_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `,
        args: [
          record.id,
          record.organizationId,
          record.createdById,
          record.createdAt,
          record.status,
          JSON.stringify({ projects: record.projects }),
          record.decidedById,
          record.decidedAt,
        ],
      }),
      (cause) => storageError('Failed to stage import', cause)
    ).map(() => undefined),

  findById: (id) =>
    ResultAsync.fromPromise(
      db.execute({
        sql: `
          SELECT id, organization_id, created_by, created_at, status, payload_json,
                 decided_by, decided_at
          FROM project_imports
          WHERE id = ?
        `,
        args: [id],
      }),
      (cause) => storageError('Failed to load import', cause)
    ).andThen((result) => {
      const row = result.rows[0];
      if (!row) {
        return okAsync(null);
      }
      const parsed = parseImportRow(row);
      return parsed.isOk() ? okAsync(parsed.value) : errAsync(parsed.error);
    }),

  listPending: (organizationId) =>
    ResultAsync.fromPromise(
      db.execute({
        sql: `
          SELECT id, organization_id, created_by, created_at, status, payload_json,
                 decided_by, decided_at
          FROM project_imports
          WHERE organization_id = ? AND status = 'pending'
          ORDER BY created_at ASC, id ASC
        `,
        args: [organizationId],
      }),
      (cause) => storageError('Failed to list imports', cause)
    ).andThen((result) => {
      const parsed = Result.combine(result.rows.map(parseImportRow));
      return parsed.isOk() ? okAsync(parsed.value) : errAsync(parsed.error);
    }),
});

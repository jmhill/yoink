/**
 * Session seed for in-process apps. The file is `*.test.ts` because that is
 * the suffix the table-ownership walker already skips. The SQL stays here so
 * `test-app.ts` does not carry an allowlisted INSERT.
 * Vitest excludes this path: a suite here would also run inside every importer.
 */
export const insertTestUserSession = async (
  database: {
    execute: (query: { sql: string; args?: unknown[] }) => Promise<unknown>;
  },
  ids: { sessionId: string; userId: string; organizationId: string }
): Promise<void> => {
  await database.execute({
    sql: `INSERT INTO user_sessions (id, user_id, current_organization_id, created_at, expires_at, last_active_at) VALUES (?, ?, ?, ?, ?, ?)`,
    args: [
      ids.sessionId,
      ids.userId,
      ids.organizationId,
      '2025-01-15T10:00:00.000Z',
      '2026-12-31T00:00:00.000Z',
      '2025-01-15T10:00:00.000Z',
    ],
  });
};

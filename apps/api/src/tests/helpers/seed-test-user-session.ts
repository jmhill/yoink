/**
 * Session seed for in-process apps. This is test support under
 * `src/tests/helpers/`, so the INSERT is exempt there and is not an allowlist
 * row. `test-app.ts` imports it. The file is not a `*.test.ts` file, so
 * Vitest does not collect it.
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

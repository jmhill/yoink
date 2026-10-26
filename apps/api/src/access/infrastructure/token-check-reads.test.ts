import { describe, expect, it } from 'vitest';
import type { Database, QueryResult } from '../../database/types.js';
import { createSqliteOrganizationStore } from './sqlite-organization-store.js';
import { createSqliteTokenStore } from './sqlite-token-store.js';
import { createSqliteUserStore } from './sqlite-user-store.js';

const empty: QueryResult = { rows: [], rowsAffected: 0 };

const recordingDatabase = () => {
  const calls: { sql: string; access: 'read' | 'write' | undefined }[] = [];
  const database: Database = {
    execute: (query) => {
      calls.push({ sql: query.sql, access: query.access });
      if (query.sql.includes('sqlite_master')) {
        const name = query.sql.includes('api_tokens')
          ? 'api_tokens'
          : query.sql.includes('organizations')
            ? 'organizations'
            : 'users';
        return Promise.resolve({ rows: [{ name }], rowsAffected: 0 });
      }
      return Promise.resolve(empty);
    },
    batch: () => Promise.resolve([]),
    close: () => Promise.resolve(),
  };
  return { calls, database };
};

describe('token check reads', () => {
  it('marks token, organization, and user lookups as reads so a stall can be retried', async () => {
    const token = recordingDatabase();
    const organization = recordingDatabase();
    const user = recordingDatabase();

    const tokenStore = await createSqliteTokenStore(token.database);
    const organizationStore = await createSqliteOrganizationStore(organization.database);
    const userStore = await createSqliteUserStore(user.database);

    await tokenStore.findById('token-1');
    await organizationStore.findById('org-1');
    await userStore.findById('user-1');

    expect(token.calls.filter((call) => call.sql.includes('FROM api_tokens'))).toEqual([
      expect.objectContaining({ access: 'read' }),
    ]);
    expect(organization.calls.filter((call) => call.sql.includes('FROM organizations'))).toEqual([
      expect.objectContaining({ access: 'read' }),
    ]);
    expect(user.calls.filter((call) => call.sql.includes('FROM users'))).toEqual([
      expect.objectContaining({ access: 'read' }),
    ]);
  });
});

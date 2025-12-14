import { describe, it, expect, beforeEach, beforeAll, afterAll } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { createSqliteOrganizationStore } from './sqlite-organization-store.js';
import { runMigrations } from '../../database/migrator.js';
import { migrations } from '../../database/migrations.js';
import type { Organization } from '../domain/organization.js';
import type { OrganizationStore } from '../domain/organization-store.js';

const createTestOrganization = (
  overrides: Partial<Organization> = {}
): Organization => ({
  id: '550e8400-e29b-41d4-a716-446655440001',
  name: 'Test Organization',
  createdAt: '2024-01-01T00:00:00.000Z',
  ...overrides,
});

describe('createSqliteOrganizationStore', () => {
  let db: DatabaseSync;
  let store: OrganizationStore;

  beforeAll(() => {
    db = new DatabaseSync(':memory:');
    runMigrations(db, migrations);
  });

  afterAll(() => {
    db.close();
  });

  beforeEach(() => {
    // Clear data between tests
    db.exec('DELETE FROM api_tokens');
    db.exec('DELETE FROM captures');
    db.exec('DELETE FROM users');
    db.exec('DELETE FROM organizations');

    store = createSqliteOrganizationStore(db);
  });

  describe('save', () => {
    it('persists an organization', async () => {
      const org = createTestOrganization();

      const saveResult = await store.save(org);

      expect(saveResult.isOk()).toBe(true);

      const findResult = await store.findById(org.id);
      expect(findResult.isOk()).toBe(true);
      if (findResult.isOk()) {
        expect(findResult.value).toEqual(org);
      }
    });
  });

  describe('findById', () => {
    it('returns organization when found', async () => {
      const org = createTestOrganization({ name: 'My Org' });
      await store.save(org);

      const result = await store.findById(org.id);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).not.toBeNull();
        expect(result.value?.name).toBe('My Org');
      }
    });

    it('returns null when organization not found', async () => {
      const result = await store.findById('non-existent-id');

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toBeNull();
      }
    });
  });
});

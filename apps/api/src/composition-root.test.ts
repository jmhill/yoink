import { describe, it, expect } from 'vitest';
import {
  createInfrastructure,
  createAppFromConfig,
} from './composition-root.js';
import { runMigrations } from './database/migrator.js';
import { migrations } from './database/migrations.js';
import type { AppConfig } from './config/schema.js';

const createTestConfig = (overrides?: Partial<AppConfig>): AppConfig => ({
  server: { port: 3000, host: '0.0.0.0' },
  database: { type: 'memory' },
  infrastructure: {
    clock: { type: 'fake' },
    idGenerator: { type: 'sequential' },
    passwordHasher: { type: 'fake' },
  },
  ...overrides,
});

describe('composition root', () => {
  describe('createInfrastructure', () => {
    it('creates infrastructure with memory database', () => {
      const config = createTestConfig();

      const infrastructure = createInfrastructure(config);

      expect(infrastructure.database).toBeDefined();
      expect(infrastructure.clock).toBeDefined();
      expect(infrastructure.idGenerator).toBeDefined();
      expect(infrastructure.passwordHasher).toBeDefined();
    });

    it('creates infrastructure with fake clock when configured', () => {
      const config = createTestConfig({
        infrastructure: {
          clock: { type: 'fake', startTime: new Date('2025-01-01') },
          idGenerator: { type: 'sequential' },
          passwordHasher: { type: 'fake' },
        },
      });

      const infrastructure = createInfrastructure(config);

      expect(infrastructure.clock.now()).toEqual(new Date('2025-01-01'));
    });

    it('creates infrastructure with system clock when configured', () => {
      const config = createTestConfig({
        infrastructure: {
          clock: { type: 'system' },
          idGenerator: { type: 'sequential' },
          passwordHasher: { type: 'fake' },
        },
      });
      const before = new Date();

      const infrastructure = createInfrastructure(config);

      const now = infrastructure.clock.now();
      expect(now.getTime()).toBeGreaterThanOrEqual(before.getTime());
    });

    it('creates infrastructure with uuid generator when configured', () => {
      const config = createTestConfig({
        infrastructure: {
          clock: { type: 'fake' },
          idGenerator: { type: 'uuid' },
          passwordHasher: { type: 'fake' },
        },
      });

      const infrastructure = createInfrastructure(config);

      const id = infrastructure.idGenerator.generate();
      // UUID format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
      expect(id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      );
    });

    it('creates infrastructure with sequential generator when configured', () => {
      const config = createTestConfig({
        infrastructure: {
          clock: { type: 'fake' },
          idGenerator: { type: 'sequential' },
          passwordHasher: { type: 'fake' },
        },
      });

      const infrastructure = createInfrastructure(config);

      // FakeIdGenerator produces deterministic UUID-like IDs
      expect(infrastructure.idGenerator.generate()).toBe(
        '00000000-0000-4000-8000-000000000001'
      );
      expect(infrastructure.idGenerator.generate()).toBe(
        '00000000-0000-4000-8000-000000000002'
      );
    });

    it('creates infrastructure with bcrypt hasher when configured', async () => {
      const config = createTestConfig({
        infrastructure: {
          clock: { type: 'fake' },
          idGenerator: { type: 'sequential' },
          passwordHasher: { type: 'bcrypt' },
        },
      });

      const infrastructure = createInfrastructure(config);

      const hash = await infrastructure.passwordHasher.hash('password');
      expect(hash).toMatch(/^\$2[aby]?\$/); // bcrypt hash prefix
    });

    it('creates infrastructure with fake hasher when configured', async () => {
      const config = createTestConfig({
        infrastructure: {
          clock: { type: 'fake' },
          idGenerator: { type: 'sequential' },
          passwordHasher: { type: 'fake' },
        },
      });

      const infrastructure = createInfrastructure(config);

      const hash = await infrastructure.passwordHasher.hash('password');
      expect(hash).toBe('fake-hash:password');
    });
  });

  describe('createAppFromConfig', () => {
    it('creates a working app from config', async () => {
      const config = createTestConfig();
      const infrastructure = createInfrastructure(config);
      runMigrations(infrastructure.database.db, migrations);

      const app = await createAppFromConfig({ config, infrastructure, silent: true });

      expect(app).toBeDefined();
      // Verify the app has registered routes
      const response = await app.inject({ method: 'GET', url: '/health' });
      expect(response.statusCode).toBe(200);
    });

    it('seeds auth data when seedToken is provided', async () => {
      const config = createTestConfig({ seedToken: 'my-seed-token' });
      const infrastructure = createInfrastructure(config);
      runMigrations(infrastructure.database.db, migrations);

      const app = await createAppFromConfig({ config, infrastructure, silent: true });

      // The seeded token should work for authentication
      // Token format is tokenId:secret, where tokenId is the first generated ID
      const response = await app.inject({
        method: 'POST',
        url: '/captures',
        headers: {
          authorization: `Bearer 00000000-0000-4000-8000-000000000001:my-seed-token`,
        },
        payload: { content: 'Test capture content' },
      });
      // Should get past auth (201 created, not 401 unauthorized)
      expect(response.statusCode).toBe(201);
    });
  });
});

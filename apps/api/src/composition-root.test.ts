import { describe, it, expect } from 'vitest';
import { createInfrastructure, bootstrapApp } from './composition-root.js';
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
  log: { level: 'error', pretty: false },
  ...overrides,
});

describe('bootstrapApp', () => {
  it('creates a working app from config', async () => {
    const config = createTestConfig();
    const infrastructure = createInfrastructure(config);
    runMigrations(infrastructure.database.db, migrations);

    const app = await bootstrapApp({ config, infrastructure, silent: true });

    expect(app).toBeDefined();
    // Verify the app has registered routes
    const response = await app.inject({ method: 'GET', url: '/api/health' });
    expect(response.statusCode).toBe(200);
  });

  it('seeds auth data when seedToken is provided', async () => {
    const config = createTestConfig({ seedToken: 'my-seed-token' });
    const infrastructure = createInfrastructure(config);
    runMigrations(infrastructure.database.db, migrations);

    const app = await bootstrapApp({ config, infrastructure, silent: true });

    // The seeded token should work for authentication
    // Token format is tokenId:secret, where tokenId is the first generated ID
    const response = await app.inject({
      method: 'POST',
      url: '/api/captures',
      headers: {
        authorization: `Bearer 00000000-0000-4000-8000-000000000001:my-seed-token`,
      },
      payload: { content: 'Test capture content' },
    });
    // Should get past auth (201 created, not 401 unauthorized)
    expect(response.statusCode).toBe(201);
  });
});

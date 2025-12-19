import { describe, it, expect, beforeAll } from 'vitest';
import type { HttpClient } from '../helpers/http-client.js';
import { createTestContext } from '../helpers/test-app.js';

describe('Health API', () => {
  let client: HttpClient;

  beforeAll(async () => {
    const context = await createTestContext();
    client = context.client;
  });

  describe('GET /health', () => {
    it('returns 200 without authentication', async () => {
      const response = await client.get('/health');

      expect(response.statusCode).toBe(200);
    });

    it('returns healthy status with database connected', async () => {
      const response = await client.get('/health');

      const body = response.json();

      expect(body).toEqual({
        status: 'healthy',
        database: 'connected',
      });
    });

    it('returns correct content-type header', async () => {
      const response = await client.get('/health');

      expect(response.headers['content-type']).toContain('application/json');
    });
  });
});

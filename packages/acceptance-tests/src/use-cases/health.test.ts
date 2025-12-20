import { describe, it, expect, beforeAll } from 'vitest';
import { createHttpClient, type HttpClient } from '../drivers/index.js';
import { getTestConfig } from '../config.js';

describe('Health', () => {
  let client: HttpClient;

  beforeAll(() => {
    const config = getTestConfig();
    client = createHttpClient(config.baseUrl);
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

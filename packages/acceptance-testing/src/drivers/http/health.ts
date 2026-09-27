import type { Health, HealthStatus, PublicFileHeaders } from '../../dsl/index.js';
import type { HttpClient } from './http-client.js';

/**
 * HTTP implementation of the Health interface.
 */
export const createHttpHealth = (client: HttpClient): Health => ({
  async check(): Promise<HealthStatus> {
    const response = await client.get('/api/health');
    return response.json<HealthStatus>();
  },

  async getPublicFileHeaders(path: string): Promise<PublicFileHeaders> {
    const response = await client.get(path);
    return {
      statusCode: response.statusCode,
      cacheControl: response.headers['cache-control'],
      contentType: response.headers['content-type'],
      body: response.body,
    };
  },
});

import type { Health, HealthStatus } from '../../dsl/index.js';
import type { HttpClient } from './http-client.js';

/**
 * HTTP implementation of the Health interface.
 */
export const createHttpHealth = (client: HttpClient): Health => ({
  async check(): Promise<HealthStatus> {
    const response = await client.get('/health');
    return response.json<HealthStatus>();
  },
});

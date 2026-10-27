import { describe, expect, it } from 'vitest';
import { createFastifyInstance } from './app.js';
import { trustImmediateProxy, TRUST_PROXY_HOPS } from './trust-proxy.js';

describe('trustImmediateProxy', () => {
  it('trusts only the immediate hop, the same as Fastify 4 trustProxy 1', () => {
    expect(TRUST_PROXY_HOPS).toBe(1);
    expect(trustImmediateProxy('203.0.113.7', 0)).toBe(true);
    expect(trustImmediateProxy('9.9.9.9', 1)).toBe(false);
  });
});

describe('createFastifyInstance trust proxy', () => {
  it('uses the client address from one forwarded hop as request.ip', async () => {
    const app = createFastifyInstance({
      level: 'error',
      pretty: false,
      sentry: { enabled: false, minLevel: 'info' },
    });
    app.get('/ip', async (request) => ({ ip: request.ip, ips: request.ips }));
    await app.ready();

    const response = await app.inject({
      method: 'GET',
      url: '/ip',
      remoteAddress: '203.0.113.7',
      headers: {
        'x-forwarded-for': '9.9.9.9',
        'x-forwarded-proto': 'https',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      ip: '9.9.9.9',
      ips: ['203.0.113.7', '9.9.9.9'],
    });
    await app.close();
  });
});

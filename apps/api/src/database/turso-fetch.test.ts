import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { describe, expect, it } from 'vitest';
import { fetchWithTimeout } from './turso-fetch.js';

const listen = (server: Server): Promise<string> =>
  new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (address === null || typeof address === 'string') {
        reject(new Error('expected a TCP port'));
        return;
      }
      const info: AddressInfo = address;
      resolve(`http://127.0.0.1:${info.port}/`);
    });
  });

const close = (server: Server): Promise<void> =>
  new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });

describe('fetchWithTimeout', () => {
  it('returns a fast response, including a Request body the way Turso sends one', async () => {
    const server = createServer((request, response) => {
      const chunks: Buffer[] = [];
      request.on('data', (chunk: Buffer) => {
        chunks.push(chunk);
      });
      request.on('end', () => {
        response.writeHead(200);
        response.end(Buffer.concat(chunks).toString('utf8'));
      });
    });
    const url = await listen(server);

    const response = await fetchWithTimeout(1000)(
      new Request(url, { method: 'POST', body: 'pipeline' }) as unknown as Parameters<
        typeof fetch
      >[0]
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('pipeline');
    await close(server);
  });

  it('aborts a response that never arrives', async () => {
    const server = createServer(() => undefined);
    const url = await listen(server);

    await expect(
      fetchWithTimeout(40)(
        new Request(url, { method: 'POST', body: 'stalled' }) as unknown as Parameters<
          typeof fetch
        >[0]
      )
    ).rejects.toMatchObject({ name: 'TimeoutError' });

    await close(server);
  });
});

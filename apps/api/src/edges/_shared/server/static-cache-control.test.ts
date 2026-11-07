import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { describe, it, expect, afterEach } from 'vitest';
import {
  NEVER_CACHE_CONTROL,
  IMMUTABLE_ASSET_CACHE_CONTROL,
  applyStaticCacheHeaders,
  cacheControlForStaticPath,
} from './static-cache-control.js';

describe('cacheControlForStaticPath', () => {
  it.each([
    '/var/app/public/sw.js',
    'C:\\app\\public\\sw.js',
    '/var/app/public/registerSW.js',
    '/var/app/public/workbox-a1b2c3d4.js',
    '/var/app/public/manifest.webmanifest',
    '/var/app/public/index.html',
    '/var/app/public/admin/index.html',
  ])('never-caches PWA entry files and HTML (%s)', (filePath) => {
    expect(cacheControlForStaticPath(filePath)).toBe(NEVER_CACHE_CONTROL);
  });

  it('immutably caches hashed assets', () => {
    expect(
      cacheControlForStaticPath('/var/app/public/assets/index-abc123.js')
    ).toBe(IMMUTABLE_ASSET_CACHE_CONTROL);
  });

  it('does not treat a workbox script under /assets/ as immutable', () => {
    expect(
      cacheControlForStaticPath('/var/app/public/assets/workbox-deadbeef.js')
    ).toBe(NEVER_CACHE_CONTROL);
  });

  it('leaves other public files unspecified', () => {
    expect(
      cacheControlForStaticPath('/var/app/public/icon-192x192.png')
    ).toBeUndefined();
  });
});

describe('static cache headers over HTTP', () => {
  let publicRoot: string | undefined;

  afterEach(async () => {
    if (publicRoot) {
      await rm(publicRoot, { recursive: true, force: true });
      publicRoot = undefined;
    }
  });

  it('sends never-cache for the service worker, Workbox, registerSW, and manifest', async () => {
    publicRoot = await mkdtemp(join(tmpdir(), 'yoink-static-cache-'));
    await mkdir(join(publicRoot, 'assets'));
    await writeFile(join(publicRoot, 'sw.js'), '/* sw */');
    await writeFile(join(publicRoot, 'registerSW.js'), '/* register */');
    await writeFile(join(publicRoot, 'workbox-a1b2c3d4.js'), '/* workbox */');
    await writeFile(
      join(publicRoot, 'manifest.webmanifest'),
      JSON.stringify({ name: 'Yoink' })
    );
    await writeFile(join(publicRoot, 'index.html'), '<html></html>');
    await writeFile(join(publicRoot, 'assets', 'index-abc123.js'), '/* asset */');

    const app = Fastify({ logger: false });
    await app.register(fastifyStatic, {
      root: publicRoot,
      prefix: '/',
      setHeaders: applyStaticCacheHeaders,
    });

    const neverCachePaths = [
      '/sw.js',
      '/registerSW.js',
      '/workbox-a1b2c3d4.js',
      '/manifest.webmanifest',
      '/index.html',
    ];

    for (const url of neverCachePaths) {
      const response = await app.inject({ method: 'GET', url });
      expect(response.statusCode, url).toBe(200);
      expect(response.headers['cache-control'], url).toBe(NEVER_CACHE_CONTROL);
    }

    const asset = await app.inject({
      method: 'GET',
      url: '/assets/index-abc123.js',
    });
    expect(asset.statusCode).toBe(200);
    expect(asset.headers['cache-control']).toBe(IMMUTABLE_ASSET_CACHE_CONTROL);

    await app.close();
  });
});

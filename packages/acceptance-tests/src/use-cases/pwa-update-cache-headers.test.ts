import { usingDrivers, describe, it, expect } from '@yoink/acceptance-testing';

const isNeverCache = (cacheControl: string | undefined): boolean =>
  Boolean(cacheControl?.includes('no-cache'));

const isJavaScript = (contentType: string | undefined, body: string): boolean =>
  Boolean(contentType?.includes('javascript')) && !body.includes('<html');

/**
 * A shipped phone/desktop install notices a new build only if the
 * browser re-fetches sw.js and the web app manifest. HTTP-only: the
 * production container must send never-cache for those files.
 */
usingDrivers(['http'] as const, (ctx) => {
  describe(`PWA update cache headers [${ctx.driverName}]`, () => {
    it('tells browsers never to cache the service worker', async () => {
      const sw = await ctx.health.getPublicFileHeaders('/sw.js');

      expect(sw.statusCode).toBe(200);
      expect(isNeverCache(sw.cacheControl)).toBe(true);
      expect(isJavaScript(sw.contentType, sw.body)).toBe(true);
    });

    it('tells browsers never to cache the app manifest', async () => {
      const manifest = await ctx.health.getPublicFileHeaders(
        '/manifest.webmanifest'
      );

      expect(manifest.statusCode).toBe(200);
      expect(isNeverCache(manifest.cacheControl)).toBe(true);
      expect(manifest.contentType).toMatch(/json|manifest/);
    });

    it('never-caches registerSW.js and workbox scripts when the build emits them', async () => {
      const registerSW = await ctx.health.getPublicFileHeaders('/registerSW.js');
      if (isJavaScript(registerSW.contentType, registerSW.body)) {
        expect(registerSW.statusCode).toBe(200);
        expect(isNeverCache(registerSW.cacheControl)).toBe(true);
      }

      const sw = await ctx.health.getPublicFileHeaders('/sw.js');
      const workboxFiles = [
        ...new Set(
          [...sw.body.matchAll(/workbox-[A-Za-z0-9]+\.js/g)].map(
            (match) => match[0]
          )
        ),
      ];

      for (const filename of workboxFiles) {
        const script = await ctx.health.getPublicFileHeaders(`/${filename}`);
        expect(script.statusCode).toBe(200);
        expect(isNeverCache(script.cacheControl)).toBe(true);
        expect(isJavaScript(script.contentType, script.body)).toBe(true);
      }
    });
  });
});

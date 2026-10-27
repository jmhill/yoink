export const NEVER_CACHE_CONTROL = 'no-cache, no-store, must-revalidate';
export const IMMUTABLE_ASSET_CACHE_CONTROL =
  'public, max-age=31536000, immutable';

const NEVER_CACHE_FILENAMES = new Set([
  'sw.js',
  'registerSW.js',
  'manifest.webmanifest',
]);

const WORKBOX_SCRIPT = /^workbox-.+\.js$/;

const filenameOf = (filePath: string): string =>
  filePath.replaceAll('\\', '/').split('/').pop() ?? '';

/**
 * Cache-Control for files served from the web/admin static roots.
 * PWA entry files and HTML must never be cached; hashed /assets/ can be
 * immutable. Anything else is left to the default static handler.
 */
export const cacheControlForStaticPath = (
  filePath: string
): string | undefined => {
  const filename = filenameOf(filePath);
  if (
    NEVER_CACHE_FILENAMES.has(filename) ||
    WORKBOX_SCRIPT.test(filename) ||
    filename.endsWith('.html')
  ) {
    return NEVER_CACHE_CONTROL;
  }

  const normalized = filePath.replaceAll('\\', '/');
  if (normalized.includes('/assets/')) {
    return IMMUTABLE_ASSET_CACHE_CONTROL;
  }

  return undefined;
};

type StaticCacheReply = {
  header: (name: string, value: string) => void;
};

/**
 * @fastify/static v10 calls setHeaders with the Fastify reply.
 * reply.header is what that reply exposes; Node's setHeader is not.
 */
export const applyStaticCacheHeaders = (
  reply: StaticCacheReply,
  filePath: string
): void => {
  const cacheControl = cacheControlForStaticPath(filePath);
  if (cacheControl === undefined) {
    return;
  }
  reply.header('Cache-Control', cacheControl);
};

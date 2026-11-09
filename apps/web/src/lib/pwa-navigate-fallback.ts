/**
 * Workbox NavigationRoute matches denylist regexes against
 * `url.pathname + url.search`. Same-origin `/admin` (the admin app), `/api`,
 * and `/test-api` must not receive the PWA SPA `index.html` fallback.
 * `/admin-api`, `/web-api`, and `/extension-api` must not receive the web app.
 * `/extension-api/v1` is mounted. `/admin-api` and `/web-api` are not.
 * `/admin-api` does not match the `/admin` pattern.
 */
export const PWA_NAVIGATE_FALLBACK_DENYLIST: RegExp[] = [
  /^\/admin(?:\/|$|\?)/,
  /^\/api(?:\/|$|\?)/,
  /^\/test-api(?:\/|$|\?)/,
  /^\/admin-api(?:\/|$|\?)/,
  /^\/web-api(?:\/|$|\?)/,
  /^\/extension-api(?:\/|$|\?)/,
];

export const isPwaNavigateFallbackDenied = (
  pathnameAndSearch: string
): boolean =>
  PWA_NAVIGATE_FALLBACK_DENYLIST.some((pattern) =>
    pattern.test(pathnameAndSearch)
  );

/**
 * Workbox NavigationRoute matches denylist regexes against
 * `url.pathname + url.search`. Same-origin `/admin` (the admin app) and
 * `/api` must not receive the PWA SPA `index.html` fallback.
 */
export const PWA_NAVIGATE_FALLBACK_DENYLIST: RegExp[] = [
  /^\/admin(?:\/|$|\?)/,
  /^\/api(?:\/|$|\?)/,
];

export const isPwaNavigateFallbackDenied = (
  pathnameAndSearch: string
): boolean =>
  PWA_NAVIGATE_FALLBACK_DENYLIST.some((pattern) =>
    pattern.test(pathnameAndSearch)
  );

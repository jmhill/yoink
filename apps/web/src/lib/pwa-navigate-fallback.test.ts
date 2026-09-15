import { describe, it, expect } from 'vitest';
import {
  PWA_NAVIGATE_FALLBACK_DENYLIST,
  isPwaNavigateFallbackDenied,
} from './pwa-navigate-fallback';

describe('PWA_NAVIGATE_FALLBACK_DENYLIST', () => {
  it('is a Workbox navigateFallbackDenylist (array of RegExp)', () => {
    expect(PWA_NAVIGATE_FALLBACK_DENYLIST.length).toBeGreaterThan(0);
    expect(
      PWA_NAVIGATE_FALLBACK_DENYLIST.every((pattern) => pattern instanceof RegExp)
    ).toBe(true);
  });

  it('includes a pattern that matches /admin and /admin/ paths', () => {
    const matchesAdmin = PWA_NAVIGATE_FALLBACK_DENYLIST.some(
      (pattern) => pattern.test('/admin') && pattern.test('/admin/login')
    );
    expect(matchesAdmin).toBe(true);
  });

  it('includes a pattern that matches /api paths', () => {
    const matchesApi = PWA_NAVIGATE_FALLBACK_DENYLIST.some(
      (pattern) => pattern.test('/api') && pattern.test('/api/tasks')
    );
    expect(matchesApi).toBe(true);
  });
});

describe('isPwaNavigateFallbackDenied', () => {
  it.each([
    '/admin',
    '/admin/',
    '/admin/login',
    '/admin/organizations/1',
    '/admin?next=%2F',
  ])('denies admin navigation %s', (pathnameAndSearch) => {
    expect(isPwaNavigateFallbackDenied(pathnameAndSearch)).toBe(true);
  });

  it.each(['/api', '/api/', '/api/tasks', '/api/admin/session'])(
    'denies API navigation %s',
    (pathnameAndSearch) => {
      expect(isPwaNavigateFallbackDenied(pathnameAndSearch)).toBe(true);
    }
  );

  it.each(['/', '/inbox', '/tasks', '/share', '/login', '/settings'])(
    'still SPA-fallbacks web app navigation %s',
    (pathnameAndSearch) => {
      expect(isPwaNavigateFallbackDenied(pathnameAndSearch)).toBe(false);
    }
  );
});

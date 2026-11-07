import { describe, expect, it } from 'vitest';
import { decideSpaFallback } from './spa-fallback.js';

describe('decideSpaFallback', () => {
  it.each(['/admin', '/admin/', '/admin/login', '/admin?next=%2F'])(
    'keeps %s on the admin app',
    (url) => {
      expect(decideSpaFallback(url)).toBe('admin-spa');
    }
  );

  it.each(['/', '/inbox', '/tasks', '/login', '/settings?tab=tokens'])(
    'keeps %s on the web app',
    (url) => {
      expect(decideSpaFallback(url)).toBe('web-spa');
    }
  );

  it.each([
    '/api',
    '/api/health',
    '/api/test/review-fixture/backdate',
    '/api/test/ownerless-workspace',
    '/test-api',
    '/test-api/review-fixture/backdate',
    '/test-api/ownerless-workspace?x=1',
    '/admin-api',
    '/admin-api/session',
    '/web-api',
    '/web-api/inbox',
    '/extension-api',
    '/extension-api/v1/captures',
  ])('does not serve index.html for %s', (url) => {
    expect(decideSpaFallback(url)).toBe('json-not-found');
  });
});

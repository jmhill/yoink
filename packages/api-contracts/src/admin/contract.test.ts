import { ProcedureContract } from '@orpc/contract';
import { getOpenAPIMeta } from '@orpc/openapi';
import { describe, expect, it } from 'vitest';
import { adminProtectedContract, adminPublicContract } from './contract.js';

const procedures = (
  router: unknown,
  key: string[] = []
): { key: string; method: string; path: string }[] => {
  if (router instanceof ProcedureContract) {
    const meta = getOpenAPIMeta(router);
    return [{ key: key.join('.'), method: meta?.method ?? '', path: meta?.path ?? '' }];
  }
  if (typeof router !== 'object' || router === null) return [];
  return Object.entries(router).flatMap(([name, value]) => procedures(value, [...key, name]));
};

describe('admin edge contract', () => {
  it('mounts every admin procedure under /admin-api', () => {
    const listed = [...procedures(adminPublicContract), ...procedures(adminProtectedContract)];
    expect(listed.map((procedure) => `${procedure.method} ${procedure.path}`)).toEqual([
      'POST /admin-api/login',
      'POST /admin-api/logout',
      'GET /admin-api/session',
      'GET /admin-api/organizations',
      'POST /admin-api/organizations',
      'POST /admin-api/organizations/{id}/owner-invitation',
      'GET /admin-api/organizations/{id}/owner-invitation',
      'GET /admin-api/organizations/{id}',
      'PATCH /admin-api/organizations/{id}',
      'GET /admin-api/organizations/{organizationId}/users',
      'POST /admin-api/organizations/{organizationId}/users',
      'PUT /admin-api/organizations/{id}/owner',
      'PATCH /admin-api/organizations/{id}/members/{userId}',
      'GET /admin-api/users/{id}',
      'PATCH /admin-api/users/{id}',
      'PATCH /admin-api/projects/{id}',
      'GET /admin-api/organizations/{organizationId}/tokens',
      'POST /admin-api/organizations/{organizationId}/tokens',
      'DELETE /admin-api/tokens/{id}',
      'POST /admin-api/organizations/{organizationId}/invitations',
    ]);
    expect(listed.some((procedure) => procedure.path.includes('/api/admin'))).toBe(false);
  });
});

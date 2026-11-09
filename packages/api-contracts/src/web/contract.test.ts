import { ProcedureContract } from '@orpc/contract';
import { getOpenAPIMeta } from '@orpc/openapi';
import { describe, expect, it } from 'vitest';
import { webInboxContract } from './contract.js';

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

describe('web inbox contract', () => {
  it('is inbox create and list, on the resource path', () => {
    const listed = procedures(webInboxContract);
    expect(listed).toEqual([
      { key: 'create', method: 'POST', path: '/inbox' },
      { key: 'list', method: 'GET', path: '/inbox' },
    ]);
    expect(listed.some((procedure) => procedure.path.includes('web-api'))).toBe(false);
  });
});

import { ProcedureContract } from '@orpc/contract';
import { getOpenAPIMeta } from '@orpc/openapi';
import { describe, expect, it } from 'vitest';
import { extensionApiV1Contract } from './contract.js';

const procedures = (router: unknown, key: string[] = []): { key: string; method: string; path: string }[] => {
  if (router instanceof ProcedureContract) {
    const meta = getOpenAPIMeta(router);
    return [{ key: key.join('.'), method: meta?.method ?? '', path: meta?.path ?? '' }];
  }
  if (typeof router !== 'object' || router === null) return [];
  return Object.entries(router).flatMap(([name, value]) => procedures(value, [...key, name]));
};

describe('extension API v1 contract', () => {
  it('is capture create and list, on the resource path', () => {
    const listed = procedures(extensionApiV1Contract);
    expect(listed).toEqual([
      { key: 'create', method: 'POST', path: '/captures' },
      { key: 'list', method: 'GET', path: '/captures' },
    ]);
    expect(listed.some((procedure) => procedure.path.includes('extension-api'))).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import { PUBLIC_API_ALIAS_PLACEHOLDER_HTTP_DATE, v1SuccessorPath } from './alias-headers.js';

describe('public API alias headers', () => {
  it('maps an alias URL onto the v1 path and keeps the query', () => {
    expect(v1SuccessorPath('/api/captures/abc?cursor=1')).toBe('/api/v1/captures/abc?cursor=1');
    expect(PUBLIC_API_ALIAS_PLACEHOLDER_HTTP_DATE).toBe('Fri, 01 Jan 2100 00:00:00 GMT');
  });
});

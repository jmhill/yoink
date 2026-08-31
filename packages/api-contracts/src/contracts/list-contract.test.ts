import { describe, it, expect } from 'vitest';
import { listContract } from './list-contract.js';

describe('listContract', () => {
  it('defines a read-only list endpoint', () => {
    expect(listContract.list.method).toBe('GET');
    expect(listContract.list.path).toBe('/api/lists');
  });

  it('has 200 and 401 responses', () => {
    expect(listContract.list.responses).toHaveProperty('200');
    expect(listContract.list.responses).toHaveProperty('401');
  });

  it('does not expose write operations', () => {
    expect(listContract).not.toHaveProperty('create');
    expect(listContract).not.toHaveProperty('update');
    expect(listContract).not.toHaveProperty('delete');
  });
});

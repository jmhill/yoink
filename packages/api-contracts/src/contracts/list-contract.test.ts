import { describe, it, expect } from 'vitest';
import { listContract } from './list-contract.js';

describe('listContract', () => {
  it('defines a list endpoint', () => {
    expect(listContract.list.method).toBe('GET');
    expect(listContract.list.path).toBe('/api/lists');
  });

  it('defines a create endpoint', () => {
    expect(listContract.create.method).toBe('POST');
    expect(listContract.create.path).toBe('/api/lists');
  });

  it('has 200 and 401 responses on list', () => {
    expect(listContract.list.responses).toHaveProperty('200');
    expect(listContract.list.responses).toHaveProperty('401');
  });

  it('has 201, 400, 401, and 409 responses on create', () => {
    expect(listContract.create.responses).toHaveProperty('201');
    expect(listContract.create.responses).toHaveProperty('400');
    expect(listContract.create.responses).toHaveProperty('401');
    expect(listContract.create.responses).toHaveProperty('409');
  });

  it('defines a delete endpoint', () => {
    expect(listContract.delete.method).toBe('DELETE');
    expect(listContract.delete.path).toBe('/api/lists/:id');
  });

  it('has 204, 401, 404, and 409 responses on delete', () => {
    expect(listContract.delete.responses).toHaveProperty('204');
    expect(listContract.delete.responses).toHaveProperty('401');
    expect(listContract.delete.responses).toHaveProperty('404');
    expect(listContract.delete.responses).toHaveProperty('409');
  });

  it('does not expose update', () => {
    expect(listContract).not.toHaveProperty('update');
  });
});

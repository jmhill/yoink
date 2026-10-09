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

  it('requires hasMore and an explicit nextCursor on list and pile responses', () => {
    const lists = listContract.list.responses[200].safeParse({
      lists: [],
      hasMore: false,
      nextCursor: null,
      total: 0,
    });
    expect(lists.success).toBe(true);

    const pile = listContract.listOpenTasks.responses[200].safeParse({
      tasks: [],
      hasMore: false,
      nextCursor: null,
      total: 0,
    });
    expect(pile.success).toBe(true);

    const missing = listContract.list.responses[200].safeParse({ lists: [] });
    expect(missing.success).toBe(false);
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

  it('defines a rename endpoint', () => {
    expect(listContract.rename.method).toBe('PATCH');
    expect(listContract.rename.path).toBe('/api/lists/:id');
  });

  it('has 200, 400, 401, 404, and 409 responses on rename', () => {
    expect(listContract.rename.responses).toHaveProperty('200');
    expect(listContract.rename.responses).toHaveProperty('400');
    expect(listContract.rename.responses).toHaveProperty('401');
    expect(listContract.rename.responses).toHaveProperty('404');
    expect(listContract.rename.responses).toHaveProperty('409');
  });

  it('defines list-open-tasks and reorder endpoints', () => {
    expect(listContract.listOpenTasks.method).toBe('GET');
    expect(listContract.listOpenTasks.path).toBe('/api/lists/:id/tasks');
    expect(listContract.reorderOpenTasks.method).toBe('PUT');
    expect(listContract.reorderOpenTasks.path).toBe('/api/lists/:id/tasks/order');
    expect(listContract.reorderOpenTasks.responses).toHaveProperty('409');
  });

  it('defines unlisted-pile list and reorder endpoints (not a fake list id)', () => {
    expect(listContract.listUnlistedOpenTasks.method).toBe('GET');
    expect(listContract.listUnlistedOpenTasks.path).toBe('/api/unlisted/tasks');
    expect(listContract.reorderUnlistedOpenTasks.method).toBe('PUT');
    expect(listContract.reorderUnlistedOpenTasks.path).toBe('/api/unlisted/tasks/order');
    expect(listContract.reorderUnlistedOpenTasks.responses).toHaveProperty('409');
    expect(listContract.reorderUnlistedOpenTasks.responses).not.toHaveProperty('404');
  });
});

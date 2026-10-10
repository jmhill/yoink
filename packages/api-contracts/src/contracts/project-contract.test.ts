import { describe, it, expect } from 'vitest';
import { projectContract } from './project-contract.js';

describe('projectContract', () => {
  it('defines list, create, get, update, and listOpenTasks endpoints', () => {
    expect(projectContract.list.method).toBe('GET');
    expect(projectContract.list.path).toBe('/api/projects');
    expect(projectContract.create.method).toBe('POST');
    expect(projectContract.create.path).toBe('/api/projects');
    expect(projectContract.get.method).toBe('GET');
    expect(projectContract.get.path).toBe('/api/projects/:id');
    expect(projectContract.update.method).toBe('PATCH');
    expect(projectContract.update.path).toBe('/api/projects/:id');
    expect(projectContract.listOpenTasks.method).toBe('GET');
    expect(projectContract.listOpenTasks.path).toBe('/api/projects/:id/tasks');
  });

  it('requires hasMore and an explicit nextCursor on list', () => {
    const listed = projectContract.list.responses[200].safeParse({
      projects: [],
      hasMore: false,
      nextCursor: null,
      total: 0,
    });
    expect(listed.success).toBe(true);

    const missing = projectContract.list.responses[200].safeParse({ projects: [] });
    expect(missing.success).toBe(false);
  });

  it('has 201, 400, 401, 403, and 409 on create', () => {
    expect(projectContract.create.responses).toHaveProperty('201');
    expect(projectContract.create.responses).toHaveProperty('400');
    expect(projectContract.create.responses).toHaveProperty('401');
    expect(projectContract.create.responses).toHaveProperty('403');
    expect(projectContract.create.responses).toHaveProperty('409');
  });
});

import { describe, it, expect } from 'vitest';
import { captureContract } from './capture-contract.js';

describe('captureContract', () => {
  it('defines create endpoint', () => {
    expect(captureContract.create.method).toBe('POST');
    expect(captureContract.create.path).toBe('/api/captures');
  });

  it('defines list endpoint', () => {
    expect(captureContract.list.method).toBe('GET');
    expect(captureContract.list.path).toBe('/api/captures');
  });

  it('has 201 response for create', () => {
    expect(captureContract.create.responses).toHaveProperty('201');
  });

  it('has 200 response for list', () => {
    expect(captureContract.list.responses).toHaveProperty('200');
  });

  it('has 401 response for unauthorized on both endpoints', () => {
    expect(captureContract.create.responses).toHaveProperty('401');
    expect(captureContract.list.responses).toHaveProperty('401');
  });

  it('defines get endpoint', () => {
    expect(captureContract.get.method).toBe('GET');
    expect(captureContract.get.path).toBe('/api/captures/:id');
  });

  it('has 200 and 404 responses for get', () => {
    expect(captureContract.get.responses).toHaveProperty('200');
    expect(captureContract.get.responses).toHaveProperty('404');
  });

  it('defines update endpoint', () => {
    expect(captureContract.update.method).toBe('PATCH');
    expect(captureContract.update.path).toBe('/api/captures/:id');
  });

  it('has 200 and 404 responses for update', () => {
    expect(captureContract.update.responses).toHaveProperty('200');
    expect(captureContract.update.responses).toHaveProperty('404');
  });

  it('defines delete endpoint', () => {
    expect(captureContract.delete.method).toBe('DELETE');
    expect(captureContract.delete.path).toBe('/api/captures/:id');
  });

  it('has 204 and 404 and 409 responses for delete', () => {
    expect(captureContract.delete.responses).toHaveProperty('204');
    expect(captureContract.delete.responses).toHaveProperty('404');
    expect(captureContract.delete.responses).toHaveProperty('409');
  });

  it('defines emptyTrash endpoint', () => {
    expect(captureContract.emptyTrash.method).toBe('POST');
    expect(captureContract.emptyTrash.path).toBe('/api/captures/trash/empty');
  });

  it('has 200 response for emptyTrash', () => {
    expect(captureContract.emptyTrash.responses).toHaveProperty('200');
  });

  it('accepts optional listId on process and omits it for unlisted', () => {
    const withList = captureContract.process.body.safeParse({
      type: 'task',
      data: { title: 'Buy milk', listId: '550e8400-e29b-41d4-a716-446655440001' },
    });
    expect(withList.success).toBe(true);

    const unlisted = captureContract.process.body.safeParse({
      type: 'task',
      data: { title: 'Loose end' },
    });
    expect(unlisted.success).toBe(true);
    if (unlisted.success) {
      expect(unlisted.data.data.listId).toBeUndefined();
    }
  });

  it('rejects null listId on process — omit listId for unlisted', () => {
    const result = captureContract.process.body.safeParse({
      type: 'task',
      data: { listId: null },
    });
    expect(result.success).toBe(false);
  });
});

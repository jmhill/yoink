import { describe, it, expect } from 'vitest';
import { captureContract } from './capture-contract.js';

describe('captureContract', () => {
  it('defines create endpoint', () => {
    expect(captureContract.create.method).toBe('POST');
    expect(captureContract.create.path).toBe('/captures');
  });

  it('defines list endpoint', () => {
    expect(captureContract.list.method).toBe('GET');
    expect(captureContract.list.path).toBe('/captures');
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
});

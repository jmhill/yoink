import { describe, it, expect } from 'vitest';
import { createUuidGenerator } from './uuid-generator.js';
import { createFakeIdGenerator } from './fake-id-generator.js';

describe('createUuidGenerator', () => {
  it('generates valid UUIDs', () => {
    const generator = createUuidGenerator();
    const id = generator.generate();

    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
  });

  it('generates unique IDs', () => {
    const generator = createUuidGenerator();
    const ids = new Set([
      generator.generate(),
      generator.generate(),
      generator.generate(),
    ]);

    expect(ids.size).toBe(3);
  });
});

describe('createFakeIdGenerator', () => {
  it('returns predefined IDs in sequence', () => {
    const generator = createFakeIdGenerator(['id-1', 'id-2', 'id-3']);

    expect(generator.generate()).toBe('id-1');
    expect(generator.generate()).toBe('id-2');
    expect(generator.generate()).toBe('id-3');
  });

  it('generates valid UUIDs when no predefined IDs provided', () => {
    const generator = createFakeIdGenerator();

    expect(generator.generate()).toBe('00000000-0000-4000-8000-000000000001');
    expect(generator.generate()).toBe('00000000-0000-4000-8000-000000000002');
    expect(generator.generate()).toBe('00000000-0000-4000-8000-000000000003');
  });

  it('falls back to valid UUIDs after predefined IDs exhausted', () => {
    const generator = createFakeIdGenerator(['only-one']);

    expect(generator.generate()).toBe('only-one');
    expect(generator.generate()).toBe('00000000-0000-4000-8000-000000000001');
    expect(generator.generate()).toBe('00000000-0000-4000-8000-000000000002');
  });
});

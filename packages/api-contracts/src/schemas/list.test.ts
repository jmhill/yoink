import { describe, it, expect } from 'vitest';
import { CreateNamedListSchema, NamedListSchema, ReorderOpenTasksSchema } from './list.js';

describe('NamedListSchema', () => {
  const validList = {
    id: '550e8400-e29b-41d4-a716-446655440000',
    organizationId: '550e8400-e29b-41d4-a716-446655440001',
    name: 'Groceries',
    createdAt: '2025-01-15T10:00:00.000Z',
    createdById: '550e8400-e29b-41d4-a716-446655440002',
  };

  it('validates a named list', () => {
    const result = NamedListSchema.safeParse(validList);
    expect(result.success).toBe(true);
  });

  it('rejects empty name', () => {
    const result = NamedListSchema.safeParse({
      ...validList,
      name: '',
    });
    expect(result.success).toBe(false);
  });

  it('rejects name over 200 characters', () => {
    const result = NamedListSchema.safeParse({
      ...validList,
      name: 'a'.repeat(201),
    });
    expect(result.success).toBe(false);
  });

  it('accepts name at exactly 200 characters', () => {
    const result = NamedListSchema.safeParse({
      ...validList,
      name: 'a'.repeat(200),
    });
    expect(result.success).toBe(true);
  });

    it('rejects invalid UUID for id', () => {
    const result = NamedListSchema.safeParse({
      ...validList,
      id: 'not-a-uuid',
    });
    expect(result.success).toBe(false);
  });
});

describe('CreateNamedListSchema', () => {
  it('accepts a name', () => {
    const result = CreateNamedListSchema.safeParse({ name: 'Groceries' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe('Groceries');
    }
  });

  it('trims surrounding whitespace', () => {
    const result = CreateNamedListSchema.safeParse({ name: '  Weekend  ' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe('Weekend');
    }
  });

  it('rejects an empty name', () => {
    const result = CreateNamedListSchema.safeParse({ name: '' });
    expect(result.success).toBe(false);
  });

  it('rejects a whitespace-only name', () => {
    const result = CreateNamedListSchema.safeParse({ name: '   ' });
    expect(result.success).toBe(false);
  });

  it('rejects a name over 200 characters', () => {
    const result = CreateNamedListSchema.safeParse({ name: 'a'.repeat(201) });
    expect(result.success).toBe(false);
  });
});

describe('ReorderOpenTasksSchema', () => {
  it('accepts a list of task ids', () => {
    const result = ReorderOpenTasksSchema.safeParse({
      taskIds: ['550e8400-e29b-41d4-a716-446655440000'],
    });
    expect(result.success).toBe(true);
  });

  it('rejects a non-uuid task id', () => {
    const result = ReorderOpenTasksSchema.safeParse({
      taskIds: ['not-a-uuid'],
    });
    expect(result.success).toBe(false);
  });
});

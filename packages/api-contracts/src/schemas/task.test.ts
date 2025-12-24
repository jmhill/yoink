import { describe, it, expect } from 'vitest';
import { TaskSchema, CreateTaskSchema, UpdateTaskSchema, TaskFilterSchema } from './task.js';

describe('TaskSchema', () => {
  const validTask = {
    id: '550e8400-e29b-41d4-a716-446655440000',
    organizationId: '550e8400-e29b-41d4-a716-446655440001',
    createdById: '550e8400-e29b-41d4-a716-446655440002',
    title: 'Complete the TPS report',
    createdAt: '2025-01-15T10:00:00.000Z',
  };

  it('validates a minimal task', () => {
    const result = TaskSchema.safeParse(validTask);
    expect(result.success).toBe(true);
  });

  it('validates task with all optional fields', () => {
    const result = TaskSchema.safeParse({
      ...validTask,
      captureId: '550e8400-e29b-41d4-a716-446655440003',
      dueDate: '2025-01-20',
      completedAt: '2025-01-16T10:00:00.000Z',
      pinnedAt: '2025-01-15T11:00:00.000Z',
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty title', () => {
    const result = TaskSchema.safeParse({
      ...validTask,
      title: '',
    });
    expect(result.success).toBe(false);
  });

  it('rejects title over 500 characters', () => {
    const result = TaskSchema.safeParse({
      ...validTask,
      title: 'a'.repeat(501),
    });
    expect(result.success).toBe(false);
  });

  it('accepts title at exactly 500 characters', () => {
    const result = TaskSchema.safeParse({
      ...validTask,
      title: 'a'.repeat(500),
    });
    expect(result.success).toBe(true);
  });

  it('validates dueDate format (YYYY-MM-DD)', () => {
    const result = TaskSchema.safeParse({
      ...validTask,
      dueDate: '2025-01-20',
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid dueDate format', () => {
    const result = TaskSchema.safeParse({
      ...validTask,
      dueDate: '01/20/2025',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid dueDate format (datetime)', () => {
    const result = TaskSchema.safeParse({
      ...validTask,
      dueDate: '2025-01-20T10:00:00.000Z',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid UUID for id', () => {
    const result = TaskSchema.safeParse({
      ...validTask,
      id: 'not-a-uuid',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid UUID for captureId', () => {
    const result = TaskSchema.safeParse({
      ...validTask,
      captureId: 'not-a-uuid',
    });
    expect(result.success).toBe(false);
  });
});

describe('CreateTaskSchema', () => {
  it('validates minimal create request', () => {
    const result = CreateTaskSchema.safeParse({
      title: 'Buy groceries',
    });
    expect(result.success).toBe(true);
  });

  it('validates with dueDate', () => {
    const result = CreateTaskSchema.safeParse({
      title: 'Buy groceries',
      dueDate: '2025-01-20',
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing title', () => {
    const result = CreateTaskSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('rejects empty title', () => {
    const result = CreateTaskSchema.safeParse({
      title: '',
    });
    expect(result.success).toBe(false);
  });
});

describe('UpdateTaskSchema', () => {
  it('validates update with title only', () => {
    const result = UpdateTaskSchema.safeParse({
      title: 'Updated title',
    });
    expect(result.success).toBe(true);
  });

  it('validates update with dueDate only', () => {
    const result = UpdateTaskSchema.safeParse({
      dueDate: '2025-02-01',
    });
    expect(result.success).toBe(true);
  });

  it('validates update with both fields', () => {
    const result = UpdateTaskSchema.safeParse({
      title: 'Updated title',
      dueDate: '2025-02-01',
    });
    expect(result.success).toBe(true);
  });

  it('validates empty update (no changes)', () => {
    const result = UpdateTaskSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('allows null dueDate to clear it', () => {
    const result = UpdateTaskSchema.safeParse({
      dueDate: null,
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty title', () => {
    const result = UpdateTaskSchema.safeParse({
      title: '',
    });
    expect(result.success).toBe(false);
  });
});

describe('TaskFilterSchema', () => {
  it('validates today filter', () => {
    const result = TaskFilterSchema.safeParse('today');
    expect(result.success).toBe(true);
  });

  it('validates upcoming filter', () => {
    const result = TaskFilterSchema.safeParse('upcoming');
    expect(result.success).toBe(true);
  });

  it('validates all filter', () => {
    const result = TaskFilterSchema.safeParse('all');
    expect(result.success).toBe(true);
  });

  it('validates completed filter', () => {
    const result = TaskFilterSchema.safeParse('completed');
    expect(result.success).toBe(true);
  });

  it('rejects invalid filter', () => {
    const result = TaskFilterSchema.safeParse('invalid');
    expect(result.success).toBe(false);
  });
});

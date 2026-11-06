import { describe, expect, it } from 'vitest';
import { ProcessCaptureBodySchema } from './process-capture.js';

describe('ProcessCaptureBodySchema', () => {
  it('accepts optional listId on process and omits it for unlisted', () => {
    const withList = ProcessCaptureBodySchema.safeParse({
      type: 'task',
      data: { title: 'Buy milk', listId: '550e8400-e29b-41d4-a716-446655440001' },
    });
    expect(withList.success).toBe(true);

    const unlisted = ProcessCaptureBodySchema.safeParse({
      type: 'task',
      data: { title: 'Loose end' },
    });
    expect(unlisted.success).toBe(true);
    if (unlisted.success) {
      expect(unlisted.data.data.listId).toBeUndefined();
    }
  });

  it('accepts optional projectId on process', () => {
    const withProject = ProcessCaptureBodySchema.safeParse({
      type: 'task',
      data: { title: 'Buy soil', projectId: '550e8400-e29b-41d4-a716-446655440006' },
    });
    expect(withProject.success).toBe(true);
  });

  it('rejects null listId on process — omit listId for unlisted', () => {
    const result = ProcessCaptureBodySchema.safeParse({
      type: 'task',
      data: { listId: null },
    });
    expect(result.success).toBe(false);
  });
});

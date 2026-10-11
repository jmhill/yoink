import { describe, expect, it } from 'vitest';
import { isOptimisticTask } from './is-optimistic-task';

describe('isOptimisticTask', () => {
  it('is true only for temp- ids', () => {
    expect(isOptimisticTask({ id: 'temp-123' })).toBe(true);
    expect(isOptimisticTask({ id: '00000000-0000-4000-8000-000000000001' })).toBe(false);
  });
});

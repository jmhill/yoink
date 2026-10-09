import { describe, it, expect } from 'vitest';
import {
  listKindForCaptureList,
  listKindForTaskFilter,
  resolveListLimit,
} from './list-kind.js';

describe('list kind policy', () => {
  it('uses the pile cap by default and history default of 50', () => {
    expect(resolveListLimit(undefined, 'pile')).toBe(1000);
    expect(resolveListLimit(undefined, 'history')).toBe(50);
    expect(resolveListLimit(5, 'pile')).toBe(5);
    expect(resolveListLimit(2000, 'history')).toBe(1000);
  });

  it('treats completed tasks and trashed/processed captures as history', () => {
    expect(listKindForTaskFilter('completed')).toBe('history');
    expect(listKindForTaskFilter('all')).toBe('pile');
    expect(listKindForCaptureList('trashed')).toBe('history');
    expect(listKindForCaptureList('processed')).toBe('history');
    expect(listKindForCaptureList('inbox')).toBe('pile');
  });
});

import { describe, it, expect } from 'vitest';
import { formatBuildLabel } from './build-label';

describe('formatBuildLabel', () => {
  it('keeps the local-dev sentinel', () => {
    expect(formatBuildLabel('dev')).toBe('dev');
  });

  it('shows the short SHA for a shipped commit', () => {
    expect(formatBuildLabel('ac15817d0da8ea317ade0e5a0a7a49f348b56dc9')).toBe(
      'ac15817'
    );
  });
});

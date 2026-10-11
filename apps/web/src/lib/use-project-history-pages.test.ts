import { describe, expect, it } from 'vitest';
import {
  PROJECT_TIMELINE_FIRST_PAGE_SIZE,
  PROJECT_TIMELINE_MORE_PAGE_SIZE,
} from './use-project-history-pages';

describe('project timeline page sizes', () => {
  it('opens History and Finished with 10, then Show more loads 20', () => {
    expect(PROJECT_TIMELINE_FIRST_PAGE_SIZE).toBe(10);
    expect(PROJECT_TIMELINE_MORE_PAGE_SIZE).toBe(20);
  });
});

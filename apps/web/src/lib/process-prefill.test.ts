import { describe, expect, it } from 'vitest';
import {
  captureUrlDomain,
  projectNameFromCapture,
  projectObjectiveFromCapture,
} from './process-prefill';

describe('projectNameFromCapture', () => {
  it('uses the first line', () => {
    expect(projectNameFromCapture('Harbor shed\nPaint the door')).toBe('Harbor shed');
  });

  it('trims and caps at 200 characters', () => {
    expect(projectNameFromCapture(`  ${'A'.repeat(220)}  `)).toBe('A'.repeat(200));
  });
});

describe('projectObjectiveFromCapture', () => {
  it('is the full content when there is no URL', () => {
    expect(projectObjectiveFromCapture({ content: 'Harbor shed' })).toBe('Harbor shed');
  });

  it('appends the URL once on its own line', () => {
    expect(
      projectObjectiveFromCapture({
        content: 'NOLA Brewing',
        sourceUrl: 'https://nolabrewing.com/events',
      })
    ).toBe('NOLA Brewing\nhttps://nolabrewing.com/events');
  });

  it('does not append a URL that is already in the content', () => {
    expect(
      projectObjectiveFromCapture({
        content: 'See https://nolabrewing.com/events tonight',
        sourceUrl: 'https://nolabrewing.com/events',
      })
    ).toBe('See https://nolabrewing.com/events tonight');
  });
});

describe('captureUrlDomain', () => {
  it('shows the host without www', () => {
    expect(captureUrlDomain('https://www.nolabrewing.com/events?x=1')).toBe('nolabrewing.com');
  });
});

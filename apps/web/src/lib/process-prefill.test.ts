import { describe, expect, it } from 'vitest';
import { PROJECT_OBJECTIVE_MAX_LENGTH } from '@yoink/api-contracts';
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
  it('is just the URL for a one-line capture', () => {
    expect(
      projectObjectiveFromCapture({
        content: 'Harbor shed',
        sourceUrl: 'https://example.com/harbor',
      })
    ).toBe('https://example.com/harbor');
  });

  it('is empty for a one-line capture with no URL', () => {
    expect(projectObjectiveFromCapture({ content: 'Desktop clip' })).toBe('');
  });

  it('uses the rest of a longer capture, then the URL', () => {
    expect(
      projectObjectiveFromCapture({
        content: 'Harbor shed\nPaint the door',
        sourceUrl: 'https://example.com/harbor',
      })
    ).toBe('Paint the door\nhttps://example.com/harbor');
  });

  it('does not append a URL that is already in the text', () => {
    expect(
      projectObjectiveFromCapture({
        content: 'Harbor shed\nSee https://example.com/harbor tonight',
        sourceUrl: 'https://example.com/harbor',
      })
    ).toBe('See https://example.com/harbor tonight');
  });

  it('splits on CRLF the same way as LF', () => {
    expect(
      projectObjectiveFromCapture({
        content: 'Harbor shed\r\nPaint the door',
        sourceUrl: 'https://example.com/harbor',
      })
    ).toBe('Paint the door\nhttps://example.com/harbor');
  });

  it('caps a long rest-plus-URL at the shared objective max', () => {
    const rest = 'B'.repeat(PROJECT_OBJECTIVE_MAX_LENGTH);
    expect(
      projectObjectiveFromCapture({
        content: `Harbor shed\n${rest}`,
        sourceUrl: 'https://example.com/harbor',
      })
    ).toBe(rest);
  });
});

describe('captureUrlDomain', () => {
  it('shows the host without www', () => {
    expect(captureUrlDomain('https://www.nolabrewing.com/events?x=1')).toBe('nolabrewing.com');
  });
});

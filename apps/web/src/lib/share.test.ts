import { describe, it, expect } from 'vitest';
import {
  extractContent,
  extractUrl,
  extractUrlFromText,
  generatePlaceholder,
  parseShareParams,
} from './share';

describe('share utilities', () => {
  describe('extractUrlFromText', () => {
    it('extracts URL when text is only a URL', () => {
      expect(extractUrlFromText('https://x.com/user/status/123')).toBe(
        'https://x.com/user/status/123'
      );
    });

    it('extracts URL with leading/trailing whitespace', () => {
      expect(extractUrlFromText('  https://x.com/foo  ')).toBe(
        'https://x.com/foo'
      );
    });

    it('extracts http URLs', () => {
      expect(extractUrlFromText('http://example.com')).toBe(
        'http://example.com'
      );
    });

    it('returns undefined for non-URL text', () => {
      expect(extractUrlFromText('Just some text')).toBeUndefined();
    });

    it('returns undefined for text containing URL with other content', () => {
      expect(
        extractUrlFromText('Check this out: https://x.com/foo')
      ).toBeUndefined();
    });

    it('returns undefined for empty string', () => {
      expect(extractUrlFromText('')).toBeUndefined();
    });

    it('returns undefined for whitespace only', () => {
      expect(extractUrlFromText('   ')).toBeUndefined();
    });
  });

  describe('extractUrl', () => {
    it('returns explicit url param when present', () => {
      expect(extractUrl({ url: 'https://example.com', text: 'hello' })).toBe(
        'https://example.com'
      );
    });

    it('extracts URL from text when no explicit url param', () => {
      expect(extractUrl({ text: 'https://x.com/user/status/123' })).toBe(
        'https://x.com/user/status/123'
      );
    });

    it('prefers explicit url param over URL in text', () => {
      expect(
        extractUrl({
          url: 'https://example.com',
          text: 'https://x.com/foo',
        })
      ).toBe('https://example.com');
    });

    it('returns undefined when no URL present', () => {
      expect(extractUrl({ text: 'Just some text' })).toBeUndefined();
    });

    it('returns undefined for empty params', () => {
      expect(extractUrl({})).toBeUndefined();
    });
  });

  describe('extractContent', () => {
    it('combines title and text', () => {
      expect(extractContent({ title: 'Page Title', text: 'Some text' })).toBe(
        'Page Title\n\nSome text'
      );
    });

    it('excludes URL-only text from content', () => {
      expect(
        extractContent({ title: 'Title', text: 'https://x.com/foo' })
      ).toBe('Title');
    });

    it('returns empty string when text is URL-only and no title', () => {
      expect(extractContent({ text: 'https://x.com/foo' })).toBe('');
    });

    it('includes non-URL text normally', () => {
      expect(extractContent({ text: 'Just some text' })).toBe('Just some text');
    });

    it('excludes URL from url param (as before)', () => {
      expect(
        extractContent({
          title: 'Title',
          text: 'Content',
          url: 'https://example.com',
        })
      ).toBe('Title\n\nContent');
    });

    it('returns empty string for URL-only params', () => {
      expect(extractContent({ url: 'https://example.com' })).toBe('');
    });
  });

  describe('generatePlaceholder', () => {
    it('generates placeholder for x.com URL', () => {
      expect(generatePlaceholder('https://x.com/user/status/123')).toBe(
        'Shared from x.com'
      );
    });

    it('generates placeholder for twitter.com URL', () => {
      expect(generatePlaceholder('https://twitter.com/user/status/123')).toBe(
        'Shared from twitter.com'
      );
    });

    it('generates placeholder for linkedin.com URL', () => {
      expect(
        generatePlaceholder('https://www.linkedin.com/posts/foo')
      ).toBe('Shared from linkedin.com');
    });

    it('strips www prefix from hostname', () => {
      expect(generatePlaceholder('https://www.example.com/page')).toBe(
        'Shared from example.com'
      );
    });

    it('returns empty string for undefined URL', () => {
      expect(generatePlaceholder(undefined)).toBe('');
    });

    it('returns fallback for invalid URL', () => {
      expect(generatePlaceholder('not-a-url')).toBe('Shared link');
    });
  });

  describe('parseShareParams', () => {
    it('parses all params from URLSearchParams', () => {
      const params = new URLSearchParams(
        'title=Page&text=Content&url=https://example.com'
      );
      expect(parseShareParams(params)).toEqual({
        title: 'Page',
        text: 'Content',
        url: 'https://example.com',
      });
    });

    it('returns null for missing params', () => {
      const params = new URLSearchParams('text=Content');
      expect(parseShareParams(params)).toEqual({
        title: null,
        text: 'Content',
        url: null,
      });
    });
  });
});

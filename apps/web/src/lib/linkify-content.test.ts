import { describe, expect, it } from 'vitest';
import { splitContentLinks } from './linkify-content';

describe('splitContentLinks', () => {
  it('treats a whole-content https URL as a single link', () => {
    expect(splitContentLinks('https://example.com/path')).toEqual([
      { type: 'link', href: 'https://example.com/path', value: 'https://example.com/path' },
    ]);
  });

  it('treats a whole-content http URL as a single link', () => {
    expect(splitContentLinks('http://example.com/path')).toEqual([
      { type: 'link', href: 'http://example.com/path', value: 'http://example.com/path' },
    ]);
  });

  it('linkifies only the URL inside surrounding prose', () => {
    expect(splitContentLinks('check this https://example.com/path later')).toEqual([
      { type: 'text', value: 'check this ' },
      { type: 'link', href: 'https://example.com/path', value: 'https://example.com/path' },
      { type: 'text', value: ' later' },
    ]);
  });

  it('leaves free text with no URL as a single text segment', () => {
    expect(splitContentLinks('buy oat milk')).toEqual([
      { type: 'text', value: 'buy oat milk' },
    ]);
  });

  it('does not linkify a bare domain', () => {
    expect(splitContentLinks('see example.com later')).toEqual([
      { type: 'text', value: 'see example.com later' },
    ]);
  });

  it('does not linkify scheme-less www', () => {
    expect(splitContentLinks('see www.example.com later')).toEqual([
      { type: 'text', value: 'see www.example.com later' },
    ]);
  });

  it('keeps trailing punctuation out of the link', () => {
    expect(splitContentLinks('see https://example.com/path.')).toEqual([
      { type: 'text', value: 'see ' },
      { type: 'link', href: 'https://example.com/path', value: 'https://example.com/path' },
      { type: 'text', value: '.' },
    ]);
  });

  it('linkifies multiple http(s) URLs', () => {
    expect(
      splitContentLinks('a https://example.com/one and http://example.com/two')
    ).toEqual([
      { type: 'text', value: 'a ' },
      { type: 'link', href: 'https://example.com/one', value: 'https://example.com/one' },
      { type: 'text', value: ' and ' },
      { type: 'link', href: 'http://example.com/two', value: 'http://example.com/two' },
    ]);
  });

  it('returns an empty text segment for empty content', () => {
    expect(splitContentLinks('')).toEqual([{ type: 'text', value: '' }]);
  });
});

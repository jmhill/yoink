/**
 * Share target utilities for handling Android share intent data
 */

type ShareParams = {
  title?: string | null;
  text?: string | null;
  url?: string | null;
};

/**
 * Combines share parameters into a single content string.
 * Filters out empty values and joins with double newlines.
 *
 * @example
 * combineShareParams({ title: 'Page Title', text: 'Some text', url: 'https://example.com' })
 * // Returns: "Page Title\n\nSome text\n\nhttps://example.com"
 *
 * @example
 * combineShareParams({ url: 'https://example.com' })
 * // Returns: "https://example.com"
 */
export function combineShareParams(params: ShareParams): string {
  const parts = [params.title, params.text, params.url].filter(
    (part): part is string => Boolean(part && part.trim())
  );

  return parts.map((p) => p.trim()).join('\n\n');
}

/**
 * Parses share parameters from URL search params.
 */
export function parseShareParams(searchParams: URLSearchParams): ShareParams {
  return {
    title: searchParams.get('title'),
    text: searchParams.get('text'),
    url: searchParams.get('url'),
  };
}

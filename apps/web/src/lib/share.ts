/**
 * Share target utilities for handling Android share intent data
 */

export type ShareParams = {
  title?: string | null;
  text?: string | null;
  url?: string | null;
};

/**
 * Extracts content from share parameters (title and text only).
 * The URL is kept separate and should be passed as sourceUrl.
 *
 * @example
 * extractContent({ title: 'Page Title', text: 'Some text', url: 'https://example.com' })
 * // Returns: "Page Title\n\nSome text"
 *
 * @example
 * extractContent({ url: 'https://example.com' })
 * // Returns: ""
 */
export function extractContent(params: ShareParams): string {
  const parts = [params.title, params.text].filter(
    (part): part is string => Boolean(part && part.trim())
  );

  return parts.map((p) => p.trim()).join('\n\n');
}

/**
 * Extracts the URL from share parameters.
 * Returns undefined if no valid URL is present.
 */
export function extractUrl(params: ShareParams): string | undefined {
  const url = params.url?.trim();
  return url || undefined;
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

/**
 * @deprecated Use extractContent and extractUrl instead
 */
export function combineShareParams(params: ShareParams): string {
  const parts = [params.title, params.text, params.url].filter(
    (part): part is string => Boolean(part && part.trim())
  );

  return parts.map((p) => p.trim()).join('\n\n');
}

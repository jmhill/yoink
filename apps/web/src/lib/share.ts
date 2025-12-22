/**
 * Share target utilities for handling Android share intent data
 */

export type ShareParams = {
  title?: string | null;
  text?: string | null;
  url?: string | null;
};

/**
 * Detects if text is a URL or contains only a URL (with optional whitespace).
 * Returns the extracted URL or undefined if not a URL-only string.
 *
 * @example
 * extractUrlFromText('https://x.com/user/status/123')
 * // Returns: "https://x.com/user/status/123"
 *
 * @example
 * extractUrlFromText('Check this: https://x.com/foo')
 * // Returns: undefined (text contains more than just the URL)
 */
export function extractUrlFromText(text: string): string | undefined {
  const trimmed = text.trim();
  if (!trimmed) return undefined;

  // Check if the entire string is a valid URL (http or https)
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    // Verify it's a valid URL by trying to parse it
    try {
      new URL(trimmed);
      return trimmed;
    } catch {
      return undefined;
    }
  }

  return undefined;
}

/**
 * Extracts content from share parameters (title and text only).
 * The URL is kept separate and should be passed as sourceUrl.
 * If text is URL-only, it is excluded from content (will be used as sourceUrl).
 *
 * @example
 * extractContent({ title: 'Page Title', text: 'Some text', url: 'https://example.com' })
 * // Returns: "Page Title\n\nSome text"
 *
 * @example
 * extractContent({ title: 'Title', text: 'https://x.com/foo' })
 * // Returns: "Title" (URL-only text is excluded)
 *
 * @example
 * extractContent({ url: 'https://example.com' })
 * // Returns: ""
 */
export function extractContent(params: ShareParams): string {
  // If text is URL-only, exclude it from content (it will become sourceUrl)
  const textIsUrlOnly = params.text ? extractUrlFromText(params.text) : null;
  const textContent = textIsUrlOnly ? null : params.text;

  const parts = [params.title, textContent].filter(
    (part): part is string => Boolean(part && part.trim())
  );

  return parts.map((p) => p.trim()).join('\n\n');
}

/**
 * Extracts the URL from share parameters.
 * First checks explicit url param, then falls back to detecting URL in text field.
 * Returns undefined if no valid URL is present.
 */
export function extractUrl(params: ShareParams): string | undefined {
  // First, check explicit url param
  const explicitUrl = params.url?.trim();
  if (explicitUrl) return explicitUrl;

  // Fall back to detecting URL in text field
  if (params.text) {
    return extractUrlFromText(params.text);
  }

  return undefined;
}

/**
 * Generates placeholder content for a captured URL.
 * Used when the share contains only a URL with no other content.
 *
 * @example
 * generatePlaceholder('https://x.com/user/status/123')
 * // Returns: "Shared from x.com"
 *
 * @example
 * generatePlaceholder('https://www.linkedin.com/posts/foo')
 * // Returns: "Shared from linkedin.com"
 */
export function generatePlaceholder(url: string | undefined): string {
  if (!url) return '';

  try {
    const hostname = new URL(url).hostname.replace(/^www\./, '');
    return `Shared from ${hostname}`;
  } catch {
    return 'Shared link';
  }
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

export type ContentSegment =
  | { type: 'text'; value: string }
  | { type: 'link'; href: string; value: string };

const HTTP_URL_PATTERN = /https?:\/\/[^\s<>"'`]+/gi;
const TRAILING_PUNCTUATION = new Set([
  '.',
  ',',
  ';',
  ':',
  '!',
  '?',
  ')',
  ']',
  '}',
  "'",
  '"',
]);

const isHttpUrl = (value: string): boolean => {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
};

const trimTrailingPunctuation = (raw: string): string => {
  let end = raw.length;
  while (end > 0 && TRAILING_PUNCTUATION.has(raw[end - 1]!)) {
    end -= 1;
  }
  return raw.slice(0, end);
};

/**
 * Split capture content into plain text and http(s) link segments.
 * Scheme is required — bare domains and scheme-less `www.` stay text.
 */
export function splitContentLinks(content: string): ContentSegment[] {
  if (content === '') {
    return [{ type: 'text', value: '' }];
  }

  const pattern = new RegExp(HTTP_URL_PATTERN.source, 'gi');
  const segments: ContentSegment[] = [];
  let lastIndex = 0;
  let match = pattern.exec(content);

  while (match) {
    const raw = match[0];
    const start = match.index;
    const href = trimTrailingPunctuation(raw);

    if (isHttpUrl(href)) {
      if (start > lastIndex) {
        segments.push({ type: 'text', value: content.slice(lastIndex, start) });
      }
      segments.push({ type: 'link', href, value: href });
      lastIndex = start + href.length;
    }

    match = pattern.exec(content);
  }

  if (lastIndex < content.length) {
    segments.push({ type: 'text', value: content.slice(lastIndex) });
  }

  return segments.length > 0 ? segments : [{ type: 'text', value: content }];
}

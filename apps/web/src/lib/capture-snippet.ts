export const CAPTURE_CONTENT_TEST_ID = 'capture-content';
export const CAPTURE_SOURCE_LINE_TEST_ID = 'capture-source-line';
export const CAPTURE_SNIPPET_TEST_ID = 'capture-snippet';

/**
 * Costume source labels for known `sourceApp` values. Unknown apps
 * surface as stored so we do not invent a second vocabulary.
 */
const SOURCE_APP_LABELS: Record<string, string> = {
  'browser-extension': 'Chrome',
  'android-share': 'Android',
  web: 'typed',
  share: 'share',
};

export type CaptureSourceKind = 'chrome' | 'android' | 'typed' | 'share' | 'unknown';

export function captureSourceLabel(sourceApp?: string | null): string | undefined {
  if (sourceApp === undefined || sourceApp === null || sourceApp === '') {
    return undefined;
  }
  return SOURCE_APP_LABELS[sourceApp] ?? sourceApp;
}

export function captureSourceKind(sourceApp?: string | null): CaptureSourceKind {
  switch (sourceApp) {
    case 'browser-extension':
      return 'chrome';
    case 'android-share':
      return 'android';
    case 'web':
      return 'typed';
    case 'share':
      return 'share';
    default:
      return 'unknown';
  }
}

export function formatCapturedAt(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  const diffHours = Math.floor(diffMs / 3_600_000);
  const diffDays = Math.floor(diffMs / 86_400_000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

/**
 * Costume source line: "Chrome · just now". Time-only when sourceApp is absent.
 */
export function captureSourceLine(options: {
  sourceApp?: string | null;
  capturedAt: string;
  now?: Date;
}): string {
  const time = formatCapturedAt(options.capturedAt, options.now ?? new Date());
  const source = captureSourceLabel(options.sourceApp);
  return source === undefined ? time : `${source} · ${time}`;
}

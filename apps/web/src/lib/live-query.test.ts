import { afterEach, describe, expect, it } from 'vitest';
import {
  LIVE_QUERY_REFETCH_INTERVAL_MS,
  LIVE_QUERY_TEST_INTERVAL_KEY,
  createAppQueryClient,
  isBlockingQueryFailure,
  liveQueryRefetchInterval,
  readLiveQueryIntervalMs,
} from './live-query';

const setVisibility = (state: DocumentVisibilityState) => {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    value: state,
  });
};

describe('live query interval', () => {
  afterEach(() => {
    setVisibility('visible');
    delete (window as Window & { [LIVE_QUERY_TEST_INTERVAL_KEY]?: number })[
      LIVE_QUERY_TEST_INTERVAL_KEY
    ];
  });

  it('defaults to 10 seconds while the document is visible', () => {
    setVisibility('visible');
    expect(readLiveQueryIntervalMs()).toBe(LIVE_QUERY_REFETCH_INTERVAL_MS);
    expect(liveQueryRefetchInterval()).toBe(10_000);
  });

  it('pauses while the tab is hidden', () => {
    setVisibility('hidden');
    expect(liveQueryRefetchInterval()).toBe(false);
  });

  it('uses a test-only override so E2E does not wait the real interval', () => {
    setVisibility('visible');
    (
      window as Window & { [LIVE_QUERY_TEST_INTERVAL_KEY]?: number }
    )[LIVE_QUERY_TEST_INTERVAL_KEY] = 250;
    expect(liveQueryRefetchInterval()).toBe(250);
  });

  it('does not treat a failed background refetch as a blocking error', () => {
    expect(isBlockingQueryFailure(new Error('offline'), { status: 200, body: [] })).toBe(
      false
    );
    expect(isBlockingQueryFailure(new Error('offline'), undefined)).toBe(true);
    expect(isBlockingQueryFailure(null, undefined)).toBe(false);
  });

  it('configures the app QueryClient to poll only while focused', () => {
    const client = createAppQueryClient();
    const queries = client.getDefaultOptions().queries;
    expect(queries?.refetchInterval).toBe(liveQueryRefetchInterval);
    expect(queries?.refetchIntervalInBackground).toBe(false);
    expect(queries?.refetchOnWindowFocus).toBe(true);
  });
});

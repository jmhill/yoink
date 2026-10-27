import type { Browser, BrowserContext, BrowserContextOptions } from '@playwright/test';

/**
 * Playwright's library default is no timeout. A stuck action never settles,
 * so the Vitest worker stays up and the CI runner is lost with no log.
 * Bound every test context so the action fails and the suite can finish.
 */
const ACTION_TIMEOUT_MS = 20_000;

export const openTestBrowserContext = async (
  browser: Browser,
  options: BrowserContextOptions
): Promise<BrowserContext> => {
  const context = await browser.newContext(options);
  context.setDefaultTimeout(ACTION_TIMEOUT_MS);
  context.setDefaultNavigationTimeout(ACTION_TIMEOUT_MS);
  return context;
};

import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

/**
 * Playwright walkthrough shots for PR sign-off.
 * Files land under docs/pr-artifacts/<story> so they can be committed
 * and linked from the PR.
 */
export type WalkthroughViewport = 'desktop' | 'phone';

const STEP_PATTERN = /^[a-z0-9_]+$/;
const STORY_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const walkthroughScreenshotPath = (input: {
  repoRoot: string;
  story: string;
  viewport: WalkthroughViewport;
  step: string;
}): string => {
  if (!STORY_PATTERN.test(input.story)) {
    throw new Error(`Walkthrough story folder must be a kebab-case slug: ${input.story}`);
  }
  if (!STEP_PATTERN.test(input.step)) {
    throw new Error(`Walkthrough screenshot step must be snake_case: ${input.step}`);
  }
  return path.join(
    input.repoRoot,
    'docs',
    'pr-artifacts',
    input.story,
    `${input.viewport}_${input.step}.png`
  );
};

export const findRepoRoot = (fromDir: string): string => {
  let dir = path.resolve(fromDir);
  for (;;) {
    if (existsSync(path.join(dir, 'pnpm-workspace.yaml'))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      throw new Error('Could not find repo root (pnpm-workspace.yaml)');
    }
    dir = parent;
  }
};

/**
 * Kit Select fade/zoom is still running when Playwright first sees the
 * option as visible. Wait until the named option is up and the open
 * menu has finished animating (opacity 1, no in-flight animations).
 */
export const waitForSettledOpenSelect = async (input: {
  page: {
    getByRole: (role: 'listbox') => {
      locator: (selector: string) => {
        filter: (options: { hasText: string }) => {
          waitFor: (options: { state: 'visible' }) => Promise<unknown>;
        };
        first: () => { waitFor: (options: { state: 'visible' }) => Promise<unknown> };
      };
    };
    locator: (selector: string) => {
      last: () => {
        waitFor: (options: { state: 'visible' }) => Promise<unknown>;
        evaluate: (
          fn: (el: {
            getAnimations: (options: { subtree: boolean }) => Array<{
              finished: Promise<unknown>;
            }>;
            ownerDocument: {
              defaultView: {
                getComputedStyle: (element: unknown) => { opacity: string };
              } | null;
            };
          }) => Promise<void>
        ) => Promise<unknown>;
      };
    };
  };
  visibleOptionName?: string;
}): Promise<void> => {
  const listbox = input.page.getByRole('listbox');
  const option = input.visibleOptionName
    ? listbox.locator('[data-slot="select-item"]').filter({ hasText: input.visibleOptionName })
    : listbox.locator('[data-slot="select-item"]').first();
  await option.waitFor({ state: 'visible' });

  const menu = input.page.locator('[data-slot="select-content"]').last();
  await menu.waitFor({ state: 'visible' });
  // Callback must be self-contained: Playwright serializes it into the page.
  await menu.evaluate(async (el) => {
    const view = el.ownerDocument.defaultView;
    if (view === null) {
      throw new Error('expected a window for computed style');
    }
    const finish = () =>
      Promise.all(
        el.getAnimations({ subtree: true }).map((animation) => animation.finished.catch(() => undefined))
      );
    const deadline = Date.now() + 2000;
    while (Date.now() < deadline) {
      await finish();
      if (view.getComputedStyle(el).opacity === '1') {
        return;
      }
    }
    throw new Error(`Select menu opacity settled at ${view.getComputedStyle(el).opacity}, expected 1`);
  });
  await option.waitFor({ state: 'visible' });
};

export const saveWalkthroughPng = async (input: {
  page: { screenshot: (options: { path: string; animations?: 'disabled' }) => Promise<unknown> };
  fromDir: string;
  story: string;
  viewport: WalkthroughViewport;
  step: string;
}): Promise<string> => {
  const dest = walkthroughScreenshotPath({
    repoRoot: findRepoRoot(input.fromDir),
    story: input.story,
    viewport: input.viewport,
    step: input.step,
  });
  await mkdir(path.dirname(dest), { recursive: true });
  await input.page.screenshot({ path: dest });
  return dest;
};

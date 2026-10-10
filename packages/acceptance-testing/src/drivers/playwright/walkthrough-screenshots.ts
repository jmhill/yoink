import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

/**
 * Playwright walkthrough shots for Polly's #135 sign-off.
 * Files land under docs/pr-artifacts so they can be committed and
 * embedded on the PR.
 */
export const WALKTHROUGH_STORY = '135-tasks-in-projects';

export type WalkthroughViewport = 'desktop' | 'phone';

const STEP_PATTERN = /^[a-z0-9_]+$/;

export const walkthroughScreenshotPath = (input: {
  repoRoot: string;
  viewport: WalkthroughViewport;
  step: string;
}): string => {
  if (!STEP_PATTERN.test(input.step)) {
    throw new Error(`Walkthrough screenshot step must be snake_case: ${input.step}`);
  }
  return path.join(
    input.repoRoot,
    'docs',
    'pr-artifacts',
    WALKTHROUGH_STORY,
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

export const saveWalkthroughPng = async (input: {
  page: { screenshot: (options: { path: string }) => Promise<unknown> };
  fromDir: string;
  viewport: WalkthroughViewport;
  step: string;
}): Promise<string> => {
  const dest = walkthroughScreenshotPath({
    repoRoot: findRepoRoot(input.fromDir),
    viewport: input.viewport,
    step: input.step,
  });
  await mkdir(path.dirname(dest), { recursive: true });
  await input.page.screenshot({ path: dest });
  return dest;
};

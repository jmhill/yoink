import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  findRepoRoot,
  walkthroughScreenshotPath,
} from './walkthrough-screenshots.js';

describe('walkthroughScreenshotPath', () => {
  it('writes snake_case phone and desktop files under the story artifacts folder', () => {
    expect(
      walkthroughScreenshotPath({
        repoRoot: '/repo',
        viewport: 'desktop',
        step: 'edit_project_picker',
      })
    ).toBe('/repo/docs/pr-artifacts/135-tasks-in-projects/desktop_edit_project_picker.png');
    expect(
      walkthroughScreenshotPath({
        repoRoot: '/repo',
        viewport: 'phone',
        step: 'remove_task_from_project',
      })
    ).toBe('/repo/docs/pr-artifacts/135-tasks-in-projects/phone_remove_task_from_project.png');
  });

  it('rejects a step that is not snake_case', () => {
    expect(() =>
      walkthroughScreenshotPath({
        repoRoot: '/repo',
        viewport: 'desktop',
        step: '../escape',
      })
    ).toThrow(/snake_case/);
  });
});

describe('findRepoRoot', () => {
  it('walks up from this module to the workspace root', () => {
    const root = findRepoRoot(path.dirname(fileURLToPath(import.meta.url)));
    expect(existsSync(path.join(root, 'pnpm-workspace.yaml'))).toBe(true);
  });
});

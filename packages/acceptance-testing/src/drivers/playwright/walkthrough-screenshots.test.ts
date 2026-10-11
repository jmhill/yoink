import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  findRepoRoot,
  OPEN_DIALOG_CONTENT,
  walkthroughScreenshotPath,
} from './walkthrough-screenshots.js';

describe('walkthroughScreenshotPath', () => {
  it('writes snake_case phone and desktop files under the given story folder', () => {
    expect(
      walkthroughScreenshotPath({
        repoRoot: '/repo',
        story: '135-tasks-in-projects',
        viewport: 'desktop',
        step: 'edit_project_picker',
      })
    ).toBe('/repo/docs/pr-artifacts/135-tasks-in-projects/desktop_edit_project_picker.png');
    expect(
      walkthroughScreenshotPath({
        repoRoot: '/repo',
        story: '136-other-story',
        viewport: 'phone',
        step: 'remove_task_from_project',
      })
    ).toBe('/repo/docs/pr-artifacts/136-other-story/phone_remove_task_from_project.png');
  });

  it('rejects a step that is not snake_case', () => {
    expect(() =>
      walkthroughScreenshotPath({
        repoRoot: '/repo',
        story: '135-tasks-in-projects',
        viewport: 'desktop',
        step: '../escape',
      })
    ).toThrow(/snake_case/);
  });

  it('rejects a story folder that is not a kebab-case slug', () => {
    expect(() =>
      walkthroughScreenshotPath({
        repoRoot: '/repo',
        story: '../escape',
        viewport: 'desktop',
        step: 'edit_project_picker',
      })
    ).toThrow(/kebab-case/);
  });
});

describe('OPEN_DIALOG_CONTENT', () => {
  it('targets only a Radix dialog that is still open, not a closing fade', () => {
    expect(OPEN_DIALOG_CONTENT).toBe('[data-slot="dialog-content"][data-state="open"]');
  });
});

describe('findRepoRoot', () => {
  it('walks up from this module to the workspace root', () => {
    const root = findRepoRoot(path.dirname(fileURLToPath(import.meta.url)));
    expect(existsSync(path.join(root, 'pnpm-workspace.yaml'))).toBe(true);
  });
});

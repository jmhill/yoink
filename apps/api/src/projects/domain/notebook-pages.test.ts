import { describe, it, expect } from 'vitest';
import {
  buildObsidianUrl,
  notebookPagesEqual,
  notebookPagesFromPaths,
  parseNotebookPath,
  parseNotebookPages,
} from './notebook-pages.js';

describe('parseNotebookPath', () => {
  it('accepts vault-relative paths with folders, spaces, and parentheses', () => {
    const paths = [
      '1_project_notes/personal/Interior design and furniture (Graci Interiors).md',
      '1_project_notes/personal/Louisiana homestead exemption (Polymnia).md',
      '1_project_notes/personal/home maintenance queue.md',
      '_desktop/assistant/Vault migration end state (2026-09-14).md',
      'notes/Harbor shed (dock).md',
    ];
    expect(paths.map((path) => parseNotebookPath(path).isOk())).toEqual([
      true,
      true,
      true,
      true,
      true,
    ]);
    expect(parseNotebookPath('  notes/Harbor shed.md  ')._unsafeUnwrap()).toBe(
      'notes/Harbor shed.md'
    );
  });

  it('refuses blank, absolute, parent, scheme, non-md, and too-long paths', () => {
    expect(parseNotebookPath('   ')._unsafeUnwrapErr()).toEqual({
      type: 'INVALID_NOTEBOOK_PATH',
      message: "Notebook path can't be blank",
    });
    expect(parseNotebookPath('/notes/Harbor.md')._unsafeUnwrapErr().message).toBe(
      'Notebook path must be vault-relative'
    );
    expect(parseNotebookPath('notes/../secret.md')._unsafeUnwrapErr().message).toBe(
      'Notebook path cannot contain ..'
    );
    expect(parseNotebookPath('obsidian://open?vault=x&file=y.md')._unsafeUnwrapErr().message).toBe(
      'Notebook path cannot be a URL'
    );
    expect(parseNotebookPath('https://example.com/note.md')._unsafeUnwrapErr().message).toBe(
      'Notebook path cannot be a URL'
    );
    expect(parseNotebookPath('notes/Harbor.txt')._unsafeUnwrapErr().message).toBe(
      'Notebook path must end in .md'
    );
    expect(parseNotebookPath(`${'n'.repeat(501)}.md`)._unsafeUnwrapErr().message).toBe(
      'Notebook path must be 500 characters or fewer'
    );
  });
});

describe('parseNotebookPages', () => {
  it('refuses a duplicate path in one project', () => {
    const result = parseNotebookPages(['notes/Harbor.md', 'notes/Harbor.md']);
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('NOTEBOOK_PAGE_DUPLICATE');
    }
  });

  it('treats paths as case-sensitive', () => {
    const result = parseNotebookPages(['notes/Harbor.md', 'notes/harbor.md']);
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual(['notes/Harbor.md', 'notes/harbor.md']);
    }
  });

  it('refuses more than 20 pages', () => {
    const paths = Array.from({ length: 21 }, (_, index) => `notes/page-${index}.md`);
    const result = parseNotebookPages(paths);
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('NOTEBOOK_PAGES_TOO_MANY');
    }
  });
});

describe('buildObsidianUrl', () => {
  it('percent-encodes spaces, slashes, and parentheses', () => {
    expect(
      buildObsidianUrl(
        '1_project_notes/personal/Interior design and furniture (Graci Interiors).md'
      )
    ).toBe(
      'obsidian://open?vault=jmhill-personal&file=1_project_notes%2Fpersonal%2FInterior%20design%20and%20furniture%20%28Graci%20Interiors%29.md'
    );
    expect(buildObsidianUrl("notes/O'Brien dock.md")).toBe(
      "obsidian://open?vault=jmhill-personal&file=notes%2FO%27Brien%20dock.md"
    );
  });
});

describe('notebookPagesFromPaths', () => {
  it('builds path plus url pairs in order', () => {
    expect(notebookPagesFromPaths(['notes/A.md', 'notes/B.md'])).toEqual([
      { path: 'notes/A.md', url: buildObsidianUrl('notes/A.md') },
      { path: 'notes/B.md', url: buildObsidianUrl('notes/B.md') },
    ]);
  });

  it('compares lists by exact order', () => {
    expect(notebookPagesEqual(['a.md', 'b.md'], ['a.md', 'b.md'])).toBe(true);
    expect(notebookPagesEqual(['a.md', 'b.md'], ['b.md', 'a.md'])).toBe(false);
  });
});

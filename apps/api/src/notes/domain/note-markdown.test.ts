import { describe, it, expect } from 'vitest';
import { markdownToNote, noteToMarkdown } from './note-markdown.js';

const sample = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  projectId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  version: '3',
  updatedAt: '2026-10-13T18:00:00.000Z',
  title: 'Meeting notes',
  body: 'First line\n\nMore detail',
};

describe('note markdown codec', () => {
  it('round-trips frontmatter, title line, and body', () => {
    const markdown = noteToMarkdown(sample);
    expect(markdown).toContain('id: aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
    expect(markdown).toContain('project_id: bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
    expect(markdown).toContain('# Meeting notes');
    const parsed = markdownToNote(markdown);
    expect(parsed.isOk()).toBe(true);
    if (parsed.isOk()) {
      expect(parsed.value).toEqual(sample);
    }
  });

  it('round-trips unicode titles and bodies', () => {
    const note = {
      ...sample,
      title: 'Café notes — 花园',
      body: '日本語と emoji 🌱\n\nLine two',
    };
    const parsed = markdownToNote(noteToMarkdown(note));
    expect(parsed.isOk()).toBe(true);
    if (parsed.isOk()) {
      expect(parsed.value).toEqual(note);
    }
  });

  it('round-trips an empty body', () => {
    const note = { ...sample, body: '' };
    const markdown = noteToMarkdown(note);
    expect(markdown.endsWith('# Meeting notes\n')).toBe(true);
    const parsed = markdownToNote(markdown);
    expect(parsed.isOk()).toBe(true);
    if (parsed.isOk()) {
      expect(parsed.value.body).toBe('');
      expect(parsed.value.title).toBe('Meeting notes');
    }
  });

  it('refuses markdown without frontmatter or a title line', () => {
    expect(markdownToNote('# Only a title\n\nBody').isErr()).toBe(true);
    expect(
      markdownToNote('---\nid: x\nproject_id: y\nversion: 1\nupdated_at: t\n---\nNo heading\n').isErr()
    ).toBe(true);
  });
});

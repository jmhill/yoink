import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NoteMarkdown } from './note-markdown';

describe('NoteMarkdown', () => {
  it('renders markdown and blocks raw HTML', () => {
    render(
      <NoteMarkdown body={'# Hello\n\n<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>\n'} />
    );
    expect(screen.getByRole('heading', { name: 'Hello' })).toBeTruthy();
    expect(document.querySelector('script')).toBeNull();
    expect(document.querySelector('img')).toBeNull();
  });
});

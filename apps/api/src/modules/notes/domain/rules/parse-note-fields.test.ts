import { describe, it, expect } from 'vitest';
import {
  copyNoteTitle,
  INITIAL_NOTE_VERSION,
  nextBuiltInNoteVersion,
  noteExcerpt,
  parseNoteBody,
  parseNoteTitle,
} from './parse-note-fields.js';

describe('parseNoteTitle', () => {
  it('trims and accepts a title', () => {
    expect(parseNoteTitle('  Meeting  ')._unsafeUnwrap()).toBe('Meeting');
  });

  it('refuses a blank title', () => {
    const result = parseNoteTitle('   ');
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('NOTE_TITLE_BLANK');
    }
  });

  it('refuses a title longer than 120 characters', () => {
    const result = parseNoteTitle('x'.repeat(121));
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('NOTE_TITLE_TOO_LONG');
    }
  });
});

describe('parseNoteBody', () => {
  it('allows an empty body', () => {
    expect(parseNoteBody(undefined)._unsafeUnwrap()).toBe('');
    expect(parseNoteBody('')._unsafeUnwrap()).toBe('');
  });

  it('refuses a body longer than 50,000 characters', () => {
    const result = parseNoteBody('x'.repeat(50_001));
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('NOTE_BODY_TOO_LONG');
    }
  });
});

describe('noteExcerpt', () => {
  it('returns the first non-empty line', () => {
    expect(noteExcerpt('\n\nFirst line\nSecond')).toBe('First line');
    expect(noteExcerpt('')).toBe('');
  });
});

describe('copyNoteTitle', () => {
  it('appends (copy) and keeps the result within 120 characters', () => {
    expect(copyNoteTitle('Meeting notes')).toBe('Meeting notes (copy)');
    const long = 'x'.repeat(120);
    const copied = copyNoteTitle(long);
    expect(copied.endsWith(' (copy)')).toBe(true);
    expect(copied.length).toBe(120);
  });
});

describe('nextBuiltInNoteVersion', () => {
  it('starts at 1 and increments integer versions as strings', () => {
    expect(INITIAL_NOTE_VERSION).toBe('1');
    expect(nextBuiltInNoteVersion('1')).toBe('2');
    expect(nextBuiltInNoteVersion('not-a-number')).toBe('1');
  });
});

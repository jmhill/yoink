import { describe, it, expect } from 'vitest';
import { listedCursorPayload, parseListedCursor } from './keyset-cursor.js';

describe('listed cursor payload', () => {
  it('parses a board cursor with three strings', () => {
    const parsed = parseListedCursor(
      { v: 1, view: 'tasks.board', k: ['', '2025-01-15T10:00:00.000Z', 'id'] },
      'tasks.board'
    );
    expect(parsed.isOk()).toBe(true);
    if (parsed.isOk()) {
      expect(parsed.value).toEqual({
        view: 'tasks.board',
        keys: ['', '2025-01-15T10:00:00.000Z', 'id'],
      });
      expect(listedCursorPayload(parsed.value)).toEqual({
        v: 1,
        view: 'tasks.board',
        k: ['', '2025-01-15T10:00:00.000Z', 'id'],
      });
    }
  });

  it('parses a pile cursor with int then two strings', () => {
    const parsed = parseListedCursor(
      { v: 1, view: 'tasks.pile', k: [3, '2025-01-15T10:00:00.000Z', 'id'] },
      'tasks.pile'
    );
    expect(parsed.isOk()).toBe(true);
    if (parsed.isOk()) {
      expect(parsed.value.keys).toEqual([3, '2025-01-15T10:00:00.000Z', 'id']);
    }
  });

  it('parses a project-task cursor with createdAt then id', () => {
    const parsed = parseListedCursor(
      { v: 1, view: 'tasks.project', k: ['2025-01-15T10:00:00.000Z', 'id'] },
      'tasks.project'
    );
    expect(parsed.isOk()).toBe(true);
    if (parsed.isOk()) {
      expect(parsed.value.keys).toEqual(['2025-01-15T10:00:00.000Z', 'id']);
    }
  });

  it('rejects a view mismatch', () => {
    const parsed = parseListedCursor(
      { v: 1, view: 'tasks.completed', k: ['2025-01-15T11:00:00.000Z', 'id'] },
      'tasks.board'
    );
    expect(parsed.isErr()).toBe(true);
    if (parsed.isErr()) {
      expect(parsed.error.type).toBe('INVALID_CURSOR');
    }
  });

  it('rejects numbers where strings belong', () => {
    const parsed = parseListedCursor(
      { v: 1, view: 'tasks.board', k: [1, 2, 3] },
      'tasks.board'
    );
    expect(parsed.isErr()).toBe(true);
  });

  it('rejects the wrong arity', () => {
    expect(
      parseListedCursor(
        { v: 1, view: 'tasks.board', k: ['only'] },
        'tasks.board'
      ).isErr()
    ).toBe(true);
    expect(
      parseListedCursor(
        { v: 1, view: 'tasks.board', k: ['a', 'b', 'c', 'd'] },
        'tasks.board'
      ).isErr()
    ).toBe(true);
  });

  it('rejects a payload without v/view', () => {
    const parsed = parseListedCursor({ k: ['a', 'b'] }, 'captures.feed');
    expect(parsed.isErr()).toBe(true);
  });
});

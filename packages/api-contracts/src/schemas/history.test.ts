import { describe, it, expect } from 'vitest';
import { HISTORY_STARTS_AT, HistoryPageSchema, TimelineEntrySchema } from './history.js';

describe('history contract', () => {
  it('pins history start to story 2 ship day', () => {
    expect(HISTORY_STARTS_AT).toBe('2026-10-10T13:56:00.000Z');
  });

  it('requires paging fields and historyStartsAt', () => {
    const parsed = HistoryPageSchema.safeParse({
      entries: [],
      hasMore: false,
      nextCursor: null,
      total: 0,
      historyStartsAt: HISTORY_STARTS_AT,
    });
    expect(parsed.success).toBe(true);

    const missing = HistoryPageSchema.safeParse({ entries: [] });
    expect(missing.success).toBe(false);
  });

  it('accepts an Unknown entry with time and actor', () => {
    const parsed = TimelineEntrySchema.safeParse({
      id: 'log-1',
      kind: 'Unknown',
      occurredAt: '2026-10-11T12:00:00.000Z',
      actor: { userId: null, kind: null, name: 'Unknown' },
      subject: { type: 'project', id: 'project-1', title: 'Garden', deleted: false },
      details: { kind: 'Unknown' },
    });
    expect(parsed.success).toBe(true);
  });
});

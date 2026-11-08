import { describe, expect, it } from 'vitest';
import { compileCapturePlan } from './capture-sql-participant.js';
import { planMarkProcessed } from '../../domain/projections/plan-capture.js';

describe('compileCapturePlan', () => {
  it('guards the inbox claim and names only captures', () => {
    const [statement] = compileCapturePlan(
      planMarkProcessed({
        id: 'cap-1',
        organizationId: 'org-1',
        processedAt: '2026-11-07T01:00:00.000Z',
        processedToType: 'task',
        processedToId: 'task-1',
      })
    );
    expect(statement?.guard).toBe(true);
    expect(statement?.verb).toBe('update');
    expect(statement?.sql).toContain("status = 'inbox'");
    expect(statement?.sql).not.toMatch(/\b(tasks|projects|change_log)\b/);
  });

  it('rejects a plan it does not understand', () => {
    const [statement] = compileCapturePlan({ nope: true });
    expect(statement?.sql).toBe('');
  });
});

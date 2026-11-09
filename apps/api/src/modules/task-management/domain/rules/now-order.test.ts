import { describe, it, expect } from 'vitest';
import type { NowNextActionItem, Task } from '@yoink/api-contracts';
import { compareNowDue, compareNowNextActions } from './now-order.js';

const lastChanged = {
  lastChangedAt: null,
  lastChangedBy: null,
  completedBy: null,
} as const;

const task = (overrides: Partial<Task> & Pick<Task, 'id' | 'title'>): Task => ({
  organizationId: 'org-1',
  createdById: 'user-1',
  createdAt: '2025-01-15T10:00:00.000Z',
  ...lastChanged,
  ...overrides,
});

const item = (
  id: string,
  title: string,
  projectName: string,
  dueDate?: string
): NowNextActionItem => ({
  task: task({ id, title, dueDate }),
  project: { id: `project-${id}`, name: projectName },
});

describe('compareNowNextActions', () => {
  it('sorts dated first (earliest date), then project name A–Z including undated ties', () => {
    const rows = [
      item('undated-zulu', 'Zulu undated', 'zulu'),
      item('future-echo', 'Echo future', 'echo', '2025-01-20'),
      item('overdue-minus-1', 'Minus one', 'bravo', '2025-01-14'),
      item('today', 'Today', 'alpha', '2025-01-15'),
      item('undated-alpha', 'Alpha undated', 'Alpha'),
      item('future-delta', 'Delta future', 'Delta', '2025-01-20'),
      item('overdue-minus-3', 'Minus three', 'charlie', '2025-01-12'),
    ];

    const ordered = [...rows].sort(compareNowNextActions).map((row) => row.task.id);
    expect(ordered).toEqual([
      'overdue-minus-3',
      'overdue-minus-1',
      'today',
      'future-delta',
      'future-echo',
      'undated-alpha',
      'undated-zulu',
    ]);
  });
});

describe('compareNowDue', () => {
  it('sorts by due date, then created_at, then id', () => {
    const rows = [
      task({
        id: 'later-created',
        title: 'Later created',
        dueDate: '2025-01-14',
        createdAt: '2025-01-14T12:00:00.000Z',
      }),
      task({
        id: 'earlier-created',
        title: 'Earlier created',
        dueDate: '2025-01-14',
        createdAt: '2025-01-14T08:00:00.000Z',
      }),
      task({
        id: 'oldest-due',
        title: 'Oldest due',
        dueDate: '2025-01-10',
        createdAt: '2025-01-15T10:00:00.000Z',
      }),
    ];

    const ordered = [...rows].sort(compareNowDue).map((row) => row.id);
    expect(ordered).toEqual(['oldest-due', 'earlier-created', 'later-created']);
  });
});

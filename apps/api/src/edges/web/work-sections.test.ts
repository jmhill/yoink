import { describe, expect, it } from 'vitest';
import type { NowNextActionItem, Task } from '@yoink/api-contracts';
import {
  arrangeWorkSections,
  workOwnerLabel,
  type ArrangedWorkSection,
} from './work-sections.js';

const TODAY = '2026-10-26';

const task = (id: string, title: string, dueDate?: string): Task => ({
  id,
  organizationId: 'org-1',
  createdById: 'user-1',
  title,
  createdAt: '2026-10-01T00:00:00.000Z',
  lastChangedAt: null,
  lastChangedBy: null,
  completedBy: null,
  ...(dueDate === undefined ? {} : { dueDate }),
});

const nextAction = (
  id: string,
  title: string,
  projectName: string,
  dueDate?: string
): NowNextActionItem => ({
  task: task(id, title, dueDate),
  project: { id: `project-${id}`, name: projectName },
});

const sectionIds = (
  sections: readonly ArrangedWorkSection[],
  name: ArrangedWorkSection['name']
): readonly string[] =>
  sections.find((section) => section.name === name)?.rows.map((row) => row.task.id) ?? [];

const projectLabel = (sections: readonly ArrangedWorkSection[], id: string): string | undefined => {
  for (const section of sections) {
    const row = section.rows.find((item) => item.task.id === id);
    if (row) {
      return row.projectLabel;
    }
  }
  return undefined;
};

const sourceOf = (
  sections: readonly ArrangedWorkSection[],
  id: string
): string | undefined => {
  for (const section of sections) {
    const row = section.rows.find((item) => item.task.id === id);
    if (row) {
      return row.source;
    }
  }
  return undefined;
};

describe('arrangeWorkSections', () => {
  it('keeps each page order inside overdue and inside today', () => {
    const sections = arrangeWorkSections({
      today: TODAY,
      dueTasks: [
        task('today-loose', 'Today loose', TODAY),
        task('overdue-later', 'Overdue later', '2026-10-20'),
        task('overdue-earlier', 'Overdue earlier', '2026-10-01'),
      ],
      nextActions: [
        nextAction('overdue-next', 'Overdue next', 'Alpha', '2026-10-24'),
        nextAction('today-next', 'Today next', 'Bravo', TODAY),
        nextAction('future-next', 'Future next', 'Home', '2026-11-02'),
        nextAction('plain-next', 'Plain next', 'Home'),
      ],
    });

    expect(sections.map((section) => section.name)).toEqual(['due', 'next-actions']);
    expect(sectionIds(sections, 'due')).toEqual([
      'overdue-later',
      'overdue-earlier',
      'overdue-next',
      'today-loose',
      'today-next',
    ]);
    expect(sectionIds(sections, 'next-actions')).toEqual(['future-next', 'plain-next']);
    expect(projectLabel(sections, 'overdue-next')).toBe('Alpha');
    expect(projectLabel(sections, 'today-next')).toBe('Bravo');
    expect(projectLabel(sections, 'overdue-later')).toBeUndefined();
    expect(sourceOf(sections, 'overdue-later')).toBe('due');
    expect(sourceOf(sections, 'overdue-next')).toBe('next-action');
    expect(sourceOf(sections, 'plain-next')).toBe('next-action');
  });

  it('hides Due when nothing is due', () => {
    const sections = arrangeWorkSections({
      today: TODAY,
      dueTasks: [],
      nextActions: [
        nextAction('future-next', 'Future next', 'Home', '2026-11-02'),
        nextAction('plain-next', 'Plain next', 'Home'),
      ],
    });

    expect(sections.map((section) => section.name)).toEqual(['next-actions']);
    expect(sectionIds(sections, 'due')).toEqual([]);
    expect(sectionIds(sections, 'next-actions')).toEqual(['future-next', 'plain-next']);
    expect(arrangeWorkSections({ today: TODAY, dueTasks: [], nextActions: [] })).toEqual([]);
  });

  it('shows a due next action once, under Due', () => {
    const shared = task('today-shared', 'Due today next', TODAY);
    const onlyInNext = arrangeWorkSections({
      today: TODAY,
      dueTasks: [task('overdue-loose', 'Overdue loose', '2026-10-25')],
      nextActions: [
        nextAction('today-shared', 'Due today next', 'Taxes', TODAY),
        nextAction('plain-next', 'Plain next', 'Home'),
      ],
    });

    expect(onlyInNext.map((section) => section.name)).toEqual(['due', 'next-actions']);
    expect(sectionIds(onlyInNext, 'due')).toEqual(['overdue-loose', 'today-shared']);
    expect(sectionIds(onlyInNext, 'next-actions')).toEqual(['plain-next']);
    expect(projectLabel(onlyInNext, 'today-shared')).toBe('Taxes');
    expect(sourceOf(onlyInNext, 'today-shared')).toBe('next-action');

    const inBothLists = arrangeWorkSections({
      today: TODAY,
      dueTasks: [shared, task('overdue-loose', 'Overdue loose', '2026-10-25')],
      nextActions: [
        nextAction('today-shared', 'Due today next', 'Taxes', TODAY),
        nextAction('plain-next', 'Plain next', 'Home'),
      ],
    });

    expect(sectionIds(inBothLists, 'due')).toEqual(['overdue-loose', 'today-shared']);
    expect(sectionIds(inBothLists, 'next-actions')).toEqual(['plain-next']);
    expect(projectLabel(inBothLists, 'today-shared')).toBe('Taxes');
    expect(sourceOf(inBothLists, 'today-shared')).toBe('both');
    expect(inBothLists.find((section) => section.name === 'due')?.rows).toHaveLength(2);
  });

  it('omits Next actions when every next action is due', () => {
    const sections = arrangeWorkSections({
      today: TODAY,
      dueTasks: [],
      nextActions: [nextAction('overdue-next', 'Overdue next', 'Alpha', '2026-10-20')],
    });

    expect(sections.map((section) => section.name)).toEqual(['due']);
    expect(sectionIds(sections, 'due')).toEqual(['overdue-next']);
  });
});

describe('workOwnerLabel', () => {
  const members = [
    { userId: 'viewer', email: 'viewer@example.com', kind: 'human' as const },
    { userId: 'person', email: 'pat@example.com', name: 'Pat', kind: 'human' as const },
    { userId: 'bot', email: 'bot@example.com', name: 'Lane', kind: 'agent' as const },
  ];

  it('hides the viewer and names an agent', () => {
    expect(workOwnerLabel(undefined, 'viewer', members)).toBeUndefined();
    expect(workOwnerLabel('viewer', 'viewer', members)).toBeUndefined();
    expect(workOwnerLabel('person', 'viewer', members)).toBe('pat@example.com');
    expect(workOwnerLabel('bot', 'viewer', members)).toBe('Lane');
    expect(workOwnerLabel('gone', 'viewer', members)).toBeUndefined();
  });
});

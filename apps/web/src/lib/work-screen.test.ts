import { describe, expect, it } from 'vitest';
import type { NowNextActionItem, Task } from '@yoink/api-contracts';
import { workScreenSectionCopy, workScreenSections, type WorkScreenSection } from './work-screen';

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
  sections: readonly WorkScreenSection[],
  name: WorkScreenSection['name']
): readonly string[] =>
  sections.find((section) => section.name === name)?.rows.map((row) => row.task.id) ?? [];

const projectLabel = (
  sections: readonly WorkScreenSection[],
  id: string
): string | undefined => {
  for (const section of sections) {
    const row = section.rows.find((item) => item.task.id === id);
    if (row) {
      return row.projectLabel;
    }
  }
  return undefined;
};

describe('workScreenSections', () => {
  it('puts overdue before today and keeps the existing order within each', () => {
    const sections = workScreenSections({
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
  });

  it('hides Due when nothing is due', () => {
    const sections = workScreenSections({
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
    expect(
      workScreenSections({ today: TODAY, dueTasks: [], nextActions: [] })
    ).toEqual([]);
  });

  it('shows a due next action once, under Due', () => {
    const shared = task('today-shared', 'Due today next', TODAY);
    const onlyInNext = workScreenSections({
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

    const inBothLists = workScreenSections({
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
    expect(inBothLists.find((section) => section.name === 'due')?.rows).toHaveLength(2);
  });

  it('omits Next actions when every next action is due', () => {
    const sections = workScreenSections({
      today: TODAY,
      dueTasks: [],
      nextActions: [nextAction('overdue-next', 'Overdue next', 'Alpha', '2026-10-20')],
    });

    expect(sections.map((section) => section.name)).toEqual(['due']);
    expect(sectionIds(sections, 'due')).toEqual(['overdue-next']);
  });
});

describe('workScreenSectionCopy', () => {
  it('names the two Work groups', () => {
    expect(workScreenSectionCopy('due')).toEqual({
      title: 'Due',
      emptyMessage: 'Nothing due',
    });
    expect(workScreenSectionCopy('next-actions')).toEqual({
      title: 'Next actions',
      emptyMessage: 'No next actions',
    });
  });
});

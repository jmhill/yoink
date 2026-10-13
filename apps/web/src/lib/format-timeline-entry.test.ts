import { describe, it, expect } from 'vitest';
import {
  formatFinishedLine,
  formatHistoryStartsLine,
  formatShortDate,
  formatTimelineLine,
  formatTimelineStamp,
  isAutomaticNextActionClear,
  joinChangedFields,
  shouldShowHistoryStartLine,
  visibleWebTimelineEntries,
} from './format-timeline-entry.js';
import type { TimelineEntry } from '@yoink/api-contracts';

const entry = (overrides: Partial<TimelineEntry> & Pick<TimelineEntry, 'details' | 'kind'>): TimelineEntry => ({
  id: 'log-1',
  occurredAt: '2026-10-12T20:04:00.000Z',
  actor: { userId: 'u1', kind: 'user', name: 'Lane' },
  subject: { type: 'task', id: 't1', title: 'Call Trident', deleted: false },
  ...overrides,
});

describe('formatTimelineLine', () => {
  it('formats note create, update, and delete', () => {
    expect(
      formatTimelineLine(
        entry({
          kind: 'NoteCreated',
          details: { kind: 'NoteCreated', title: 'Meeting notes' },
          subject: { type: 'note', id: 'n1', title: 'Meeting notes', deleted: false },
        })
      )
    ).toBe("Lane added the note 'Meeting notes'");
    expect(
      formatTimelineLine(
        entry({
          kind: 'NoteUpdated',
          details: {
            kind: 'NoteUpdated',
            title: 'Meeting notes',
            titleChanged: false,
            bodyChanged: true,
          },
          subject: { type: 'note', id: 'n1', title: 'Meeting notes', deleted: false },
        })
      )
    ).toBe("Lane changed the body on 'Meeting notes'");
    expect(
      formatTimelineLine(
        entry({
          kind: 'NoteDeleted',
          details: { kind: 'NoteDeleted', title: 'Meeting notes' },
          subject: { type: 'note', id: 'n1', title: 'Meeting notes', deleted: true },
        })
      )
    ).toBe("Lane deleted the note 'Meeting notes'");
  });
  it('formats a completion the way Polly reads it', () => {
    expect(
      formatTimelineLine(entry({ kind: 'TaskCompleted', details: { kind: 'TaskCompleted' } }))
    ).toBe("Lane completed 'Call Trident'");
  });

  it('shows older title edits without previousTitle as changed the title', () => {
    expect(
      formatTimelineLine(
        entry({
          kind: 'TaskUpdated',
          details: { kind: 'TaskUpdated', title: 'Pick paint colour' },
          subject: { type: 'task', id: 't1', title: 'Pick paint colour', deleted: false },
        })
      )
    ).toBe("Lane changed the title on 'Pick paint colour'");
  });

  it('names a title-only edit as a rename from the payload', () => {
    expect(
      formatTimelineLine(
        entry({
          kind: 'TaskUpdated',
          details: {
            kind: 'TaskUpdated',
            title: 'Pick paint colour',
            previousTitle: 'Paint samples',
          },
          subject: { type: 'task', id: 't1', title: 'Pick paint colour', deleted: false },
        })
      )
    ).toBe("Lane renamed 'Paint samples' to 'Pick paint colour'");
  });

  it('adds other fields after a rename', () => {
    expect(
      formatTimelineLine(
        entry({
          kind: 'TaskUpdated',
          details: {
            kind: 'TaskUpdated',
            title: 'Pick paint colour',
            previousTitle: 'Paint samples',
            dueDate: '2026-10-20',
          },
          subject: { type: 'task', id: 't1', title: 'Pick paint colour', deleted: false },
        })
      )
    ).toBe("Lane renamed 'Paint samples' to 'Pick paint colour' and changed the due date");
  });

  it('names other edits on the current title', () => {
    expect(
      formatTimelineLine(
        entry({
          kind: 'TaskUpdated',
          details: { kind: 'TaskUpdated', dueDate: '2026-10-20' },
          subject: { type: 'task', id: 't1', title: 'Pick paint colour', deleted: false },
        })
      )
    ).toBe("Lane changed the due date on 'Pick paint colour'");
    expect(
      formatTimelineLine(
        entry({
          kind: 'TaskUpdated',
          details: {
            kind: 'TaskUpdated',
            dueDate: null,
            assigneeId: 'u2',
            listId: 'l1',
          },
        })
      )
    ).toBe("Lane changed the due date, the owner and the list on 'Call Trident'");
    expect(
      formatTimelineLine(
        entry({
          kind: 'TaskUpdated',
          details: { kind: 'TaskUpdated', assigneeId: null, listId: null },
        })
      )
    ).toBe("Lane changed the owner and the list on 'Call Trident'");
  });

  it('names a project created from a capture', () => {
    expect(
      formatTimelineLine(
        entry({
          kind: 'ProjectCreated',
          details: {
            kind: 'ProjectCreated',
            name: 'Harbor',
            captureId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          },
          subject: { type: 'project', id: 'p1', title: 'Harbor', deleted: false },
        })
      )
    ).toBe('Lane created this project from a capture');
    expect(
      formatTimelineLine(
        entry({
          kind: 'ProjectCreated',
          details: { kind: 'ProjectCreated', name: 'Harbor' },
          subject: { type: 'project', id: 'p1', title: 'Harbor', deleted: false },
        })
      )
    ).toBe('Lane created this project');
    expect(
      formatTimelineLine(
        entry({
          kind: 'ProjectCreated',
          details: { kind: 'ProjectCreated', name: 'Harbor', status: 'proposed' },
          subject: { type: 'project', id: 'p1', title: 'Harbor', deleted: false },
        })
      )
    ).toBe('Lane proposed this project');
  });

  it('names propose, confirm, turn down, and restore', () => {
    expect(
      formatTimelineLine(
        entry({
          kind: 'ProjectStatusChanged',
          details: {
            kind: 'ProjectStatusChanged',
            from: 'proposed',
            to: 'active',
            waitingOn: null,
            waitingSince: null,
          },
          subject: { type: 'project', id: 'p1', title: 'Harbor', deleted: false },
        })
      )
    ).toBe('Lane confirmed it as Active');
    expect(
      formatTimelineLine(
        entry({
          kind: 'ProjectStatusChanged',
          details: {
            kind: 'ProjectStatusChanged',
            from: 'proposed',
            to: 'declined',
            waitingOn: null,
            waitingSince: null,
          },
          subject: { type: 'project', id: 'p1', title: 'Harbor', deleted: false },
        })
      )
    ).toBe('Lane turned it down');
    expect(
      formatTimelineLine(
        entry({
          kind: 'ProjectStatusChanged',
          details: {
            kind: 'ProjectStatusChanged',
            from: 'declined',
            to: 'proposed',
            waitingOn: null,
            waitingSince: null,
          },
          subject: { type: 'project', id: 'p1', title: 'Harbor', deleted: false },
        })
      )
    ).toBe('Lane restored it');
  });

  it('names each project field that changed', () => {
    expect(
      formatTimelineLine(
        entry({
          kind: 'ProjectUpdated',
          details: { kind: 'ProjectUpdated', name: 'Kitchen' },
          subject: { type: 'project', id: 'p1', title: 'Kitchen', deleted: false },
        })
      )
    ).toBe('Lane changed the name');
    expect(
      formatTimelineLine(
        entry({
          kind: 'ProjectUpdated',
          details: { kind: 'ProjectUpdated', objective: 'Finish the wall' },
          subject: { type: 'project', id: 'p1', title: 'Kitchen', deleted: false },
        })
      )
    ).toBe('Lane changed the objective');
    expect(
      formatTimelineLine(
        entry({
          kind: 'ProjectUpdated',
          details: { kind: 'ProjectUpdated', name: 'Kitchen', objective: null },
          subject: { type: 'project', id: 'p1', title: 'Kitchen', deleted: false },
        })
      )
    ).toBe('Lane changed the name and the objective');
  });

  it.each([
    ['cleared', 'cleared'],
    ['completed', 'completed'],
    ['deleted', 'deleted'],
    ['removedFromProject', 'removed from the project'],
    ['projectDone', 'project marked done'],
  ] as const)('says the next-action clear reason %s in plain English', (reason, copy) => {
    const line = formatTimelineLine(
      entry({
        kind: 'ProjectNextActionCleared',
        details: {
          kind: 'ProjectNextActionCleared',
          taskId: 't1',
          taskTitle: 'Call Trident',
          reason,
        },
        subject: { type: 'project', id: 'p1', title: 'Kitchen', deleted: false },
      })
    );
    expect(line).toBe(`Lane cleared the next action 'Call Trident' (${copy})`);
  });

  it('renders the import entry as actor · Moved in · N tasks', () => {
    expect(
      formatTimelineLine(
        entry({
          kind: 'ProjectImported',
          details: { kind: 'ProjectImported', taskCount: 2 },
          subject: { type: 'project', id: 'p1', title: 'Garden', deleted: false },
        })
      )
    ).toBe('Lane · Moved in · 2 tasks');
    expect(
      formatTimelineLine(
        entry({
          kind: 'ProjectImported',
          details: { kind: 'ProjectImported', taskCount: 1 },
          subject: { type: 'project', id: 'p1', title: 'Garden', deleted: false },
        })
      )
    ).toBe('Lane · Moved in · 1 task');
  });

  it('renders import-attached task history with the project name', () => {
    expect(
      formatTimelineLine(
        entry({
          kind: 'TaskAddedToProject',
          details: {
            kind: 'TaskAddedToProject',
            projectId: 'p1',
            projectName: 'Harbor shed',
            via: 'import',
          },
          subject: { type: 'task', id: 't1', title: 'Paint the door', deleted: false },
        })
      )
    ).toBe("Lane moved 'Paint the door' into 'Harbor shed'");
    expect(
      formatTimelineLine(
        entry({
          kind: 'TaskCreated',
          details: { kind: 'TaskCreated', via: 'import', projectName: 'Permit desk' },
          subject: { type: 'task', id: 't2', title: 'Call the clerk', deleted: false },
        })
      )
    ).toBe("Lane added 'Call the clerk' in 'Permit desk'");
  });

  it('says the actor changed the notebook pages', () => {
    expect(
      formatTimelineLine(
        entry({
          kind: 'ProjectUpdated',
          details: { kind: 'ProjectUpdated', notebookPages: ['notes/Harbor.md'] },
          subject: { type: 'project', id: 'p1', title: 'Harbor shed', deleted: false },
        })
      )
    ).toBe('Lane changed the notebook pages');
  });

  it('sets the next action', () => {
    expect(
      formatTimelineLine(
        entry({
          kind: 'ProjectNextActionSet',
          details: {
            kind: 'ProjectNextActionSet',
            taskId: 't1',
            taskTitle: 'Call Trident',
            previousTaskId: null,
            previousTaskTitle: null,
          },
          subject: { type: 'project', id: 'p1', title: 'Kitchen', deleted: false },
        })
      )
    ).toBe("Lane set the next action to 'Call Trident'");
  });
});

describe('joinChangedFields', () => {
  it('joins one, two, and many fields', () => {
    expect(joinChangedFields(['the title'])).toBe('the title');
    expect(joinChangedFields(['the title', 'the due date'])).toBe('the title and the due date');
    expect(joinChangedFields(['the title', 'the due date', 'the owner'])).toBe(
      'the title, the due date and the owner'
    );
  });
});

describe('formatFinishedLine', () => {
  it('is one line with title, who, and a short date', () => {
    expect(
      formatFinishedLine({
        title: 'Call Trident',
        name: 'Lane',
        completedAt: '2026-10-11T15:04:00.000Z',
        now: new Date(2026, 9, 11),
      })
    ).toBe('Call Trident · Finished by Lane · Oct 11');
  });

  it('keeps the year when it is not the current year', () => {
    expect(
      formatFinishedLine({
        title: 'Call Trident',
        name: 'Lane',
        completedAt: '2025-10-11T15:04:00.000Z',
        now: new Date(2026, 9, 11),
      })
    ).toBe('Call Trident · Finished by Lane · Oct 11, 2025');
  });
});

describe('formatShortDate', () => {
  it('leaves the year off in the current year', () => {
    expect(formatShortDate('2026-10-01', new Date(2026, 11, 1))).toBe('Oct 1');
  });

  it('keeps the year when it is not the current year', () => {
    expect(formatShortDate('2025-10-01', new Date(2026, 11, 1))).toBe('Oct 1, 2025');
  });
});

describe('formatTimelineStamp', () => {
  it('leaves the year off in the current year', () => {
    expect(formatTimelineStamp('2026-10-11T15:04:00.000Z', new Date(2026, 9, 11))).not.toMatch(
      /2026/
    );
  });

  it('keeps the year when it is not the current year', () => {
    expect(formatTimelineStamp('2025-10-11T15:04:00.000Z', new Date(2026, 9, 11))).toMatch(
      /2025/
    );
  });
});

describe('formatHistoryStartsLine', () => {
  it('prints History starts Oct 10, 2026', () => {
    expect(formatHistoryStartsLine()).toBe('History starts Oct 10, 2026');
  });
});

describe('shouldShowHistoryStartLine', () => {
  it('shows only when the project predates the start and there are no more pages', () => {
    expect(
      shouldShowHistoryStartLine({
        hasMore: false,
        createdAt: '2026-10-09T12:00:00.000Z',
        historyStartsAt: '2026-10-10T13:56:00.000Z',
      })
    ).toBe(true);
    expect(
      shouldShowHistoryStartLine({
        hasMore: true,
        createdAt: '2026-10-09T12:00:00.000Z',
        historyStartsAt: '2026-10-10T13:56:00.000Z',
      })
    ).toBe(false);
    expect(
      shouldShowHistoryStartLine({
        hasMore: false,
        createdAt: '2026-10-11T12:00:00.000Z',
        historyStartsAt: '2026-10-10T13:56:00.000Z',
      })
    ).toBe(false);
  });
});

describe('formatTimelineLine for membership', () => {
  it('says moved into the project for TaskAddedToProject', () => {
    expect(
      formatTimelineLine(
        entry({
          kind: 'TaskAddedToProject',
          details: { kind: 'TaskAddedToProject', projectId: 'p1' },
        })
      )
    ).toBe("Lane moved 'Call Trident' into the project");
  });

  it('says took out when a task left with no destination', () => {
    expect(
      formatTimelineLine(
        entry({
          kind: 'TaskRemovedFromProject',
          details: { kind: 'TaskRemovedFromProject', projectId: 'p1' },
          subject: { type: 'task', id: 't1', title: 'Leftover', deleted: false },
        })
      )
    ).toBe("Lane took 'Leftover' out of the project");
  });

  it('reads the destination name from the event', () => {
    expect(
      formatTimelineLine(
        entry({
          kind: 'TaskRemovedFromProject',
          details: {
            kind: 'TaskRemovedFromProject',
            projectId: 'p1',
            toProjectName: 'Other',
          },
          subject: { type: 'task', id: 't1', title: 'Order lumber', deleted: false },
        })
      )
    ).toBe("Lane moved 'Order lumber' to Other");
  });

  it('falls back to another project when the old move has no name', () => {
    expect(
      formatTimelineLine(
        entry({
          kind: 'TaskRemovedFromProject',
          details: {
            kind: 'TaskRemovedFromProject',
            projectId: 'p1',
            toProjectName: null,
          },
          subject: { type: 'task', id: 't1', title: 'Order lumber', deleted: false },
        })
      )
    ).toBe("Lane moved 'Order lumber' to another project");
  });
});

describe('formatTimelineLine for waiting', () => {
  it('sets waiting on with the short date', () => {
    expect(
      formatTimelineLine(
        entry({
          kind: 'ProjectWaitingChanged',
          details: {
            kind: 'ProjectWaitingChanged',
            waitingOn: 'Contractor',
            waitingSince: '2026-10-01',
          },
          subject: { type: 'project', id: 'p1', title: 'Kitchen', deleted: false },
        })
      )
    ).toBe('Lane set waiting on Contractor since Oct 1');
  });

  it('says since unknown when the date is missing', () => {
    expect(
      formatTimelineLine(
        entry({
          kind: 'ProjectWaitingChanged',
          details: {
            kind: 'ProjectWaitingChanged',
            waitingOn: 'Contractor',
            waitingSince: null,
          },
          subject: { type: 'project', id: 'p1', title: 'Kitchen', deleted: false },
        })
      )
    ).toBe('Lane set waiting on Contractor since unknown');
  });

  it('drops the (no date) suffix on a status change to waiting', () => {
    const line = formatTimelineLine(
      entry({
        kind: 'ProjectStatusChanged',
        details: {
          kind: 'ProjectStatusChanged',
          from: 'active',
          to: 'waiting',
          waitingOn: 'Mike',
          waitingSince: null,
        },
        subject: { type: 'project', id: 'p1', title: 'Kitchen', deleted: false },
      })
    );
    expect(line).toBe('Lane marked this project waiting');
    expect(line).not.toContain('(no date)');
    expect(line).not.toContain("Don't know");
  });
});

describe('visibleWebTimelineEntries', () => {
  const completed = entry({
    id: 'log-done',
    kind: 'TaskCompleted',
    details: { kind: 'TaskCompleted' },
  });
  const autoClear = entry({
    id: 'log-clear',
    kind: 'ProjectNextActionCleared',
    details: {
      kind: 'ProjectNextActionCleared',
      taskId: 't1',
      taskTitle: 'Call Trident',
      reason: 'completed',
    },
    subject: { type: 'project', id: 'p1', title: 'Kitchen', deleted: false },
  });
  const manualClear = entry({
    id: 'log-manual',
    kind: 'ProjectNextActionCleared',
    details: {
      kind: 'ProjectNextActionCleared',
      taskId: 't1',
      taskTitle: 'Call Trident',
      reason: 'cleared',
    },
    subject: { type: 'project', id: 'p1', title: 'Kitchen', deleted: false },
  });

  it('hides an automatic clear when the same save completed the task', () => {
    expect(isAutomaticNextActionClear(autoClear, [autoClear, completed])).toBe(true);
    expect(visibleWebTimelineEntries([autoClear, completed]).map((item) => item.id)).toEqual([
      'log-done',
    ]);
  });

  it('keeps a manual clear', () => {
    expect(isAutomaticNextActionClear(manualClear, [manualClear])).toBe(false);
    expect(visibleWebTimelineEntries([manualClear]).map((item) => item.id)).toEqual(['log-manual']);
  });

  it.each(['deleted', 'removedFromProject', 'projectDone'] as const)(
    'hides a %s automatic clear when the companion event is in the same save',
    (reason) => {
      const companion =
        reason === 'projectDone'
          ? entry({
              id: 'log-done-project',
              kind: 'ProjectStatusChanged',
              details: {
                kind: 'ProjectStatusChanged',
                from: 'active',
                to: 'done',
                waitingOn: null,
                waitingSince: null,
              },
              subject: { type: 'project', id: 'p1', title: 'Kitchen', deleted: false },
            })
          : entry({
              id: 'log-companion',
              kind: reason === 'deleted' ? 'TaskDeleted' : 'TaskRemovedFromProject',
              details:
                reason === 'deleted'
                  ? { kind: 'TaskDeleted' }
                  : { kind: 'TaskRemovedFromProject', projectId: 'p1' },
            });
      const clear = entry({
        id: 'log-auto',
        kind: 'ProjectNextActionCleared',
        details: {
          kind: 'ProjectNextActionCleared',
          taskId: 't1',
          taskTitle: 'Call Trident',
          reason,
        },
        subject: { type: 'project', id: 'p1', title: 'Kitchen', deleted: false },
      });
      expect(isAutomaticNextActionClear(clear, [clear, companion])).toBe(true);
    }
  );
});

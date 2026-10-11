import { describe, it, expect } from 'vitest';
import { nextActionClearFor } from './next-action-clear.js';

const project = {
  id: 'project-garden',
  organizationId: 'org-123',
  nextActionTaskId: 'task-soil' as string | null,
};

const now = '2026-10-10T18:00:00.000Z';

describe('nextActionClearFor', () => {
  it('clears on complete with reason completed', () => {
    expect(nextActionClearFor(project, { type: 'completed', taskId: 'task-soil' }, now)).toEqual(
      {
        type: 'ProjectNextActionCleared',
        id: project.id,
        organizationId: project.organizationId,
        taskId: 'task-soil',
        reason: 'completed',
        occurredAt: now,
      }
    );
  });

  it('clears on delete with reason deleted', () => {
    expect(nextActionClearFor(project, { type: 'deleted', taskId: 'task-soil' }, now)?.reason).toBe(
      'deleted'
    );
  });

  it('clears when the task leaves the project', () => {
    expect(
      nextActionClearFor(project, { type: 'removedFromProject', taskId: 'task-soil' }, now)
        ?.reason
    ).toBe('removedFromProject');
  });

  it('always clears on project done when a next action is set', () => {
    expect(nextActionClearFor(project, { type: 'projectDone' }, now)?.reason).toBe(
      'projectDone'
    );
  });

  it('does not clear when a different task is completed', () => {
    expect(
      nextActionClearFor(project, { type: 'completed', taskId: 'task-herbs' }, now)
    ).toBeNull();
  });

  it('does not restore or emit when there is no next action', () => {
    expect(
      nextActionClearFor(
        { ...project, nextActionTaskId: null },
        { type: 'completed', taskId: 'task-soil' },
        now
      )
    ).toBeNull();
  });
});

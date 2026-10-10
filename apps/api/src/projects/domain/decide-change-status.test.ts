import { describe, it, expect } from 'vitest';
import type { Project } from '@yoink/api-contracts';
import { decideChangeProjectStatus } from './decide-change-status.js';
import type { ChangeProjectStatusCommand } from './project-commands.js';

const garden: Project = {
  id: 'project-garden',
  organizationId: 'org-123',
  createdById: 'user-456',
  name: 'Garden',
  status: 'active',
  waitingOn: null,
  waitingSince: null,
  createdAt: '2025-01-15T10:00:00.000Z',
  lastChangedAt: '2025-01-15T10:00:00.000Z',
  lastChangedBy: 'user-456',
};

const waitingGarden: Project = {
  ...garden,
  status: 'waiting',
  waitingOn: 'Mike',
  waitingSince: '2026-09-28',
};

const doneGarden: Project = {
  ...garden,
  status: 'done',
};

const person = (overrides: Partial<ChangeProjectStatusCommand> = {}): ChangeProjectStatusCommand => ({
  id: garden.id,
  organizationId: garden.organizationId,
  status: 'someday',
  actor: { kind: 'user', userId: 'user-456', via: 'session' },
  ...overrides,
});

const bot = (overrides: Partial<ChangeProjectStatusCommand> = {}): ChangeProjectStatusCommand => ({
  id: garden.id,
  organizationId: garden.organizationId,
  status: 'someday',
  actor: { kind: 'bot', userId: 'user-lane', tokenId: 'tok-lane', name: 'Lane', via: 'token' },
  ...overrides,
});

const now = '2026-10-10T15:00:00.000Z';

describe('decideChangeProjectStatus', () => {
  it('changes active to someday', () => {
    const result = decideChangeProjectStatus({
      project: garden,
      openTaskCount: 0,
      command: person({ status: 'someday' }),
      now,
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk() && result.value.type === 'changed') {
      expect(result.value.event).toEqual({
        type: 'ProjectStatusChanged',
        id: garden.id,
        organizationId: garden.organizationId,
        from: 'active',
        to: 'someday',
        waitingOn: null,
        waitingSince: null,
        occurredAt: now,
      });
    }
  });

  it('requires waiting on when choosing waiting', () => {
    const result = decideChangeProjectStatus({
      project: garden,
      openTaskCount: 0,
      command: person({ status: 'waiting' }),
      now,
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('PROJECT_WAITING_ON_REQUIRED');
    }
  });

  it('rejects a blank waiting on', () => {
    const result = decideChangeProjectStatus({
      project: garden,
      openTaskCount: 0,
      command: person({ status: 'waiting', waitingOn: '   ' }),
      now,
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('PROJECT_WAITING_ON_BLANK');
    }
  });

  it('sets waiting with who and an unknown since', () => {
    const result = decideChangeProjectStatus({
      project: garden,
      openTaskCount: 0,
      command: person({ status: 'waiting', waitingOn: '  Mike  ' }),
      now,
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk() && result.value.type === 'changed') {
      expect(result.value.event).toMatchObject({
        type: 'ProjectStatusChanged',
        to: 'waiting',
        waitingOn: 'Mike',
        waitingSince: null,
      });
    }
  });

  it('sets waiting with a date', () => {
    const result = decideChangeProjectStatus({
      project: garden,
      openTaskCount: 0,
      command: person({
        status: 'waiting',
        waitingOn: 'Trident',
        waitingSince: '2026-10-01',
      }),
      now,
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk() && result.value.type === 'changed') {
      expect(result.value.event).toMatchObject({
        waitingOn: 'Trident',
        waitingSince: '2026-10-01',
      });
    }
  });

  it('rejects an invalid waiting since', () => {
    const result = decideChangeProjectStatus({
      project: garden,
      openTaskCount: 0,
      command: person({
        status: 'waiting',
        waitingOn: 'Mike',
        waitingSince: '2026-13-40',
      }),
      now,
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('INVALID_WAITING_SINCE');
    }
  });

  it('clears waiting fields when leaving waiting', () => {
    const result = decideChangeProjectStatus({
      project: waitingGarden,
      openTaskCount: 0,
      command: person({ status: 'active' }),
      now,
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk() && result.value.type === 'changed') {
      expect(result.value.event).toMatchObject({
        type: 'ProjectStatusChanged',
        from: 'waiting',
        to: 'active',
        waitingOn: null,
        waitingSince: null,
      });
    }
  });

  it('edits waiting on an already-waiting project', () => {
    const result = decideChangeProjectStatus({
      project: waitingGarden,
      openTaskCount: 0,
      command: person({
        status: 'waiting',
        waitingOn: 'Trident',
        waitingSince: '2026-10-02',
      }),
      now,
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk() && result.value.type === 'changed') {
      expect(result.value.event).toEqual({
        type: 'ProjectWaitingChanged',
        id: garden.id,
        organizationId: garden.organizationId,
        waitingOn: 'Trident',
        waitingSince: '2026-10-02',
        occurredAt: now,
      });
    }
  });

  it('is a no-op when status and waiting values are unchanged', () => {
    const result = decideChangeProjectStatus({
      project: waitingGarden,
      openTaskCount: 2,
      command: person({
        status: 'waiting',
        waitingOn: 'Mike',
        waitingSince: '2026-09-28',
      }),
      now,
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual({ type: 'unchanged' });
    }
  });

  it('is a no-op when a bot repeats done', () => {
    const result = decideChangeProjectStatus({
      project: doneGarden,
      openTaskCount: 1,
      command: bot({ status: 'done' }),
      now,
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual({ type: 'unchanged' });
    }
  });

  it('refuses a bot marking a project done', () => {
    const result = decideChangeProjectStatus({
      project: garden,
      openTaskCount: 0,
      command: bot({ status: 'done' }),
      now,
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('PROJECT_DONE_REQUIRES_PERSON');
    }
  });

  it('refuses a bot reopening a done project', () => {
    const result = decideChangeProjectStatus({
      project: doneGarden,
      openTaskCount: 0,
      command: bot({ status: 'active' }),
      now,
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('PROJECT_REOPEN_REQUIRES_PERSON');
    }
  });

  it('lets a bot set active, waiting, and someday, and edit waiting', () => {
    const toWaiting = decideChangeProjectStatus({
      project: garden,
      openTaskCount: 0,
      command: bot({ status: 'waiting', waitingOn: 'Mike', waitingSince: '2026-10-01' }),
      now,
    });
    expect(toWaiting.isOk()).toBe(true);

    const editWaiting = decideChangeProjectStatus({
      project: waitingGarden,
      openTaskCount: 0,
      command: bot({ status: 'waiting', waitingOn: 'Trident' }),
      now,
    });
    expect(editWaiting.isOk()).toBe(true);

    const toSomeday = decideChangeProjectStatus({
      project: garden,
      openTaskCount: 0,
      command: bot({ status: 'someday' }),
      now,
    });
    expect(toSomeday.isOk()).toBe(true);

    const toActive = decideChangeProjectStatus({
      project: waitingGarden,
      openTaskCount: 0,
      command: bot({ status: 'active' }),
      now,
    });
    expect(toActive.isOk()).toBe(true);
  });

  it('lets a person reopen a done project', () => {
    const result = decideChangeProjectStatus({
      project: doneGarden,
      openTaskCount: 0,
      command: person({ status: 'active' }),
      now,
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk() && result.value.type === 'changed') {
      expect(result.value.event).toMatchObject({ from: 'done', to: 'active' });
    }
  });

  it('refuses done with open tasks and no choice', () => {
    const result = decideChangeProjectStatus({
      project: garden,
      openTaskCount: 3,
      command: person({ status: 'done' }),
      now,
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr() && result.error.type === 'PROJECT_HAS_OPEN_TASKS') {
      expect(result.error.openTaskCount).toBe(3);
      expect(result.error.message).toBe('This project has 3 open tasks');
    }
  });

  it('allows done with open tasks when a choice is given', () => {
    const complete = decideChangeProjectStatus({
      project: garden,
      openTaskCount: 2,
      command: person({ status: 'done', openTasks: 'complete' }),
      now,
    });
    expect(complete.isOk()).toBe(true);

    const remove = decideChangeProjectStatus({
      project: garden,
      openTaskCount: 2,
      command: person({ status: 'done', openTasks: 'remove' }),
      now,
    });
    expect(remove.isOk()).toBe(true);
  });

  it('allows done with no open tasks and no choice', () => {
    const result = decideChangeProjectStatus({
      project: garden,
      openTaskCount: 0,
      command: person({ status: 'done' }),
      now,
    });

    expect(result.isOk()).toBe(true);
  });

  it('refuses proposed as a target status', () => {
    const result = decideChangeProjectStatus({
      project: garden,
      openTaskCount: 0,
      command: person({
        status: 'proposed' as ChangeProjectStatusCommand['status'],
      }),
      now,
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('INVALID_PROJECT_STATUS');
    }
  });
});

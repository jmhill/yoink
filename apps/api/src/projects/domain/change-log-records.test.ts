import { describe, it, expect } from 'vitest';
import { changeLogRecordsFromProjectEvent } from './change-log-records.js';

const person = { kind: 'user' as const, userId: 'user-456', via: 'session' as const };
const bot = {
  kind: 'bot' as const,
  userId: 'user-lane',
  tokenId: 'tok-lane',
  name: 'Lane',
  via: 'token' as const,
};

describe('changeLogRecordsFromProjectEvent', () => {
  it('writes a visible ProjectCreated record whose project_id is the project id', () => {
    const [record] = changeLogRecordsFromProjectEvent({
      event: {
        type: 'ProjectCreated',
        id: 'project-1',
        organizationId: 'org-1',
        createdById: 'user-456',
        name: 'Garden',
        status: 'active',
        createdAt: '2025-01-15T10:00:00.000Z',
        occurredAt: '2025-01-15T10:00:00.000Z',
      },
      actor: person,
      ids: { recordId: 'log-1' },
    });

    expect(record).toMatchObject({
      id: 'log-1',
      organizationId: 'org-1',
      projectId: 'project-1',
      subjectType: 'project',
      subjectId: 'project-1',
      kind: 'ProjectCreated',
      hidden: false,
      actorUserId: 'user-456',
      actorKind: 'user',
      payload: { name: 'Garden', status: 'active', createdById: 'user-456' },
    });
  });

  it('records a bot actor on ProjectUpdated', () => {
    const [record] = changeLogRecordsFromProjectEvent({
      event: {
        type: 'ProjectUpdated',
        id: 'project-1',
        organizationId: 'org-1',
        name: 'Backyard',
        objective: 'Plant herbs',
        occurredAt: '2025-01-15T11:00:00.000Z',
      },
      actor: bot,
      ids: { recordId: 'log-2' },
    });

    expect(record).toMatchObject({
      projectId: 'project-1',
      subjectType: 'project',
      kind: 'ProjectUpdated',
      hidden: false,
      actorUserId: 'user-lane',
      actorKind: 'bot',
      payload: { name: 'Backyard', objective: 'Plant herbs' },
    });
  });
});

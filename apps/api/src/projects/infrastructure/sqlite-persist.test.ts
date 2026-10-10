import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestDatabase } from '../../database/test-utils.js';
import type { Database } from '../../database/types.js';
import { createSqliteProjectPersist } from './store-backed-persist.js';
import { createSqliteChangeLogStore } from '../../shared/change-log/infrastructure/sqlite-change-log-store.js';
import { planProjectChange } from '../domain/plan-project-change.js';
import { createSqliteProjectStore } from './sqlite-project-store.js';
import { handleUpdateProject } from '../application/handle-update-project.js';

const now = '2025-01-15T10:00:00.000Z';
const later = '2025-01-15T11:00:00.000Z';

describe('sqlite project persist', () => {
  let db: Database;

  beforeEach(async () => {
    db = await createTestDatabase();
    await db.execute({
      sql: `INSERT INTO organizations (id, name, created_at) VALUES (?, ?, ?)`,
      args: ['org-1', 'Org', now],
    });
    await db.execute({
      sql: `INSERT INTO users (id, email, created_at) VALUES (?, ?, ?)`,
      args: ['user-1', 'owner@example.com', now],
    });
    await db.execute({
      sql: `INSERT INTO users (id, email, created_at) VALUES (?, ?, ?)`,
      args: ['user-lane', 'lane@yoink.invalid', now],
    });
  });

  afterEach(async () => {
    await db.close();
  });

  it('writes a ProjectCreated record with the person actor and project_id', async () => {
    const persist = createSqliteProjectPersist({ db });
    const result = await persist(
      planProjectChange({
        event: {
          type: 'ProjectCreated',
          id: 'project-1',
          organizationId: 'org-1',
          createdById: 'user-1',
          name: 'Garden',
          status: 'active',
          createdAt: now,
          occurredAt: now,
        },
        current: null,
        actor: { kind: 'user', userId: 'user-1', via: 'session' },
        ids: { recordId: 'log-1' },
      })
    );
    expect(result.isOk()).toBe(true);

    const log = createSqliteChangeLogStore(db);
    const records = (await log.findBySubject('project', 'project-1'))._unsafeUnwrap();
    expect(records).toHaveLength(1);
    expect(records[0]?.kind).toBe('ProjectCreated');
    expect(records[0]?.projectId).toBe('project-1');
    expect(records[0]?.actorUserId).toBe('user-1');
    expect(records[0]?.actorKind).toBe('user');
    expect(records[0]?.hidden).toBe(false);
  });

  it('writes a ProjectUpdated record with the bot actor', async () => {
    const persist = createSqliteProjectPersist({ db });
    await persist(
      planProjectChange({
        event: {
          type: 'ProjectCreated',
          id: 'project-1',
          organizationId: 'org-1',
          createdById: 'user-1',
          name: 'Garden',
          status: 'active',
          createdAt: now,
          occurredAt: now,
        },
        current: null,
        actor: { kind: 'user', userId: 'user-1', via: 'session' },
        ids: { recordId: 'log-create' },
      })
    );

    const store = await createSqliteProjectStore(db);
    const current = (await store.findById('project-1'))._unsafeUnwrap();
    expect(current).not.toBeNull();
    if (!current) {
      throw new Error('expected project');
    }

    const updated = await persist(
      planProjectChange({
        event: {
          type: 'ProjectUpdated',
          id: 'project-1',
          organizationId: 'org-1',
          name: 'Backyard',
          objective: 'Plant herbs',
          occurredAt: later,
        },
        current,
        actor: {
          kind: 'bot',
          userId: 'user-lane',
          tokenId: 'tok-lane',
          name: 'Lane',
          via: 'token',
        },
        ids: { recordId: 'log-update' },
      })
    );
    expect(updated.isOk()).toBe(true);

    const log = createSqliteChangeLogStore(db);
    const records = (await log.findBySubject('project', 'project-1'))._unsafeUnwrap();
    const change = records.filter((record) => record.kind === 'ProjectUpdated');
    expect(change).toHaveLength(1);
    expect(change[0]?.actorUserId).toBe('user-lane');
    expect(change[0]?.actorKind).toBe('bot');
    expect(change[0]?.projectId).toBe('project-1');
    expect(change[0]?.hidden).toBe(false);

    const after = (await store.findById('project-1'))._unsafeUnwrap();
    expect(after?.name).toBe('Backyard');
    expect(after?.objective).toBe('Plant herbs');
    expect(after?.lastChangedBy).toBe('user-lane');
  });

  it('rejects a duplicate project name ignoring case', async () => {
    const persist = createSqliteProjectPersist({ db });
    const first = await persist(
      planProjectChange({
        event: {
          type: 'ProjectCreated',
          id: 'project-1',
          organizationId: 'org-1',
          createdById: 'user-1',
          name: 'Garden',
          status: 'active',
          createdAt: now,
          occurredAt: now,
        },
        current: null,
        actor: { kind: 'user', userId: 'user-1', via: 'session' },
        ids: { recordId: 'log-1' },
      })
    );
    expect(first.isOk()).toBe(true);

    const duplicate = await persist(
      planProjectChange({
        event: {
          type: 'ProjectCreated',
          id: 'project-2',
          organizationId: 'org-1',
          createdById: 'user-1',
          name: 'garden',
          status: 'active',
          createdAt: later,
          occurredAt: later,
        },
        current: null,
        actor: { kind: 'user', userId: 'user-1', via: 'session' },
        ids: { recordId: 'log-2' },
      })
    );

    expect(duplicate.isErr()).toBe(true);
    if (duplicate.isErr()) {
      expect(duplicate.error.type).toBe('DUPLICATE_PROJECT_NAME');
    }

    const log = createSqliteChangeLogStore(db);
    const failed = (await log.findBySubject('project', 'project-2'))._unsafeUnwrap();
    expect(failed).toHaveLength(0);
    const firstLog = (await log.findBySubject('project', 'project-1'))._unsafeUnwrap();
    expect(firstLog).toHaveLength(1);
  });

  it('maps a unique-constraint update to DUPLICATE_PROJECT_NAME and writes no log row', async () => {
    const persist = createSqliteProjectPersist({ db });
    await persist(
      planProjectChange({
        event: {
          type: 'ProjectCreated',
          id: 'project-1',
          organizationId: 'org-1',
          createdById: 'user-1',
          name: 'Garden',
          status: 'active',
          createdAt: now,
          occurredAt: now,
        },
        current: null,
        actor: { kind: 'user', userId: 'user-1', via: 'session' },
        ids: { recordId: 'log-1' },
      })
    );
    await persist(
      planProjectChange({
        event: {
          type: 'ProjectCreated',
          id: 'project-2',
          organizationId: 'org-1',
          createdById: 'user-1',
          name: 'Cabin',
          status: 'active',
          createdAt: now,
          occurredAt: now,
        },
        current: null,
        actor: { kind: 'user', userId: 'user-1', via: 'session' },
        ids: { recordId: 'log-2' },
      })
    );

    const store = await createSqliteProjectStore(db);
    const current = (await store.findById('project-2'))._unsafeUnwrap();
    expect(current).not.toBeNull();
    if (!current) {
      throw new Error('expected project');
    }

    const duplicate = await persist(
      planProjectChange({
        event: {
          type: 'ProjectUpdated',
          id: 'project-2',
          organizationId: 'org-1',
          name: 'garden',
          occurredAt: later,
        },
        current,
        actor: { kind: 'user', userId: 'user-1', via: 'session' },
        ids: { recordId: 'log-3' },
      })
    );

    expect(duplicate.isErr()).toBe(true);
    if (duplicate.isErr()) {
      expect(duplicate.error.type).toBe('DUPLICATE_PROJECT_NAME');
    }

    const log = createSqliteChangeLogStore(db);
    const records = (await log.findBySubject('project', 'project-2'))._unsafeUnwrap();
    expect(records.map((record) => record.kind)).toEqual(['ProjectCreated']);
    const after = (await store.findById('project-2'))._unsafeUnwrap();
    expect(after?.name).toBe('Cabin');
  });

  it('does not write a change_log row when the update is a no-op', async () => {
    const persist = createSqliteProjectPersist({ db });
    const created = await persist(
      planProjectChange({
        event: {
          type: 'ProjectCreated',
          id: 'project-1',
          organizationId: 'org-1',
          createdById: 'user-1',
          name: 'Garden',
          status: 'active',
          createdAt: now,
          occurredAt: now,
        },
        current: null,
        actor: { kind: 'user', userId: 'user-1', via: 'session' },
        ids: { recordId: 'log-1' },
      })
    );
    expect(created.isOk()).toBe(true);

    const store = await createSqliteProjectStore(db);
    const result = await handleUpdateProject(
      {
        id: 'project-1',
        organizationId: 'org-1',
        name: 'Garden',
        objective: null,
        actor: { kind: 'user', userId: 'user-1', via: 'session' },
      },
      {
        load: (id) => store.findById(id),
        list: (organizationId) => store.findByOrganization(organizationId),
        persist,
        nextId: () => 'log-noop',
        now: () => later,
      }
    );

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.event).toBeUndefined();
      expect(result.value.view.name).toBe('Garden');
    }

    const log = createSqliteChangeLogStore(db);
    const records = (await log.findBySubject('project', 'project-1'))._unsafeUnwrap();
    expect(records).toHaveLength(1);
    expect(records[0]?.kind).toBe('ProjectCreated');
  });
});

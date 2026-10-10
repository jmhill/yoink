import { describe, it, expect } from 'vitest';
import { okAsync } from 'neverthrow';
import type { Project } from '@yoink/api-contracts';
import { handleUpdateProject } from './handle-update-project.js';
import type { ListProjects, LoadProject, PersistProjectChange } from './ports.js';
import type { ProjectChangePlan } from '../domain/plan-project-change.js';

const garden: Project = {
  id: 'project-garden',
  organizationId: 'org-123',
  createdById: 'user-456',
  name: 'garden',
  objective: 'Grow tomatoes',
  status: 'active',
  createdAt: '2025-01-15T10:00:00.000Z',
  lastChangedAt: '2025-01-15T10:00:00.000Z',
  lastChangedBy: 'user-456',
};

const cabin: Project = {
  ...garden,
  id: 'project-cabin',
  name: 'Cabin',
  objective: undefined,
};

const command = {
  id: garden.id,
  organizationId: garden.organizationId,
  name: 'Backyard',
  actor: { kind: 'user' as const, userId: 'user-456', via: 'session' as const },
};

const createInMemoryPersist = (): {
  persist: PersistProjectChange;
  plans: ProjectChangePlan[];
} => {
  const plans: ProjectChangePlan[] = [];
  return {
    plans,
    persist: (plan) => {
      plans.push(plan);
      return okAsync(undefined);
    },
  };
};

const loadGarden: LoadProject = (id) => okAsync(id === garden.id ? garden : null);
const listOrg: ListProjects = () => okAsync([garden, cabin]);

describe('handleUpdateProject', () => {
  it('loads, lists names, persists a change, and returns the view', async () => {
    const { persist, plans } = createInMemoryPersist();

    const result = await handleUpdateProject(command, {
      load: loadGarden,
      list: listOrg,
      persist,
      nextId: () => 'id-1',
      now: () => '2025-01-15T11:00:00.000Z',
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.event?.type).toBe('ProjectUpdated');
      expect(result.value.event?.name).toBe('Backyard');
      expect(result.value.view.name).toBe('Backyard');
    }
    expect(plans).toHaveLength(1);
  });

  it('returns PROJECT_NOT_FOUND without listing names when the project is missing', async () => {
    let listed = false;
    const { persist, plans } = createInMemoryPersist();

    const result = await handleUpdateProject(command, {
      load: () => okAsync(null),
      list: () => {
        listed = true;
        return okAsync([]);
      },
      persist,
      nextId: () => 'id-1',
      now: () => '2025-01-15T11:00:00.000Z',
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('PROJECT_NOT_FOUND');
    }
    expect(listed).toBe(false);
    expect(plans).toHaveLength(0);
  });

  it('returns PROJECT_NOT_FOUND when the project is in another organization', async () => {
    const { persist, plans } = createInMemoryPersist();

    const result = await handleUpdateProject(command, {
      load: () => okAsync({ ...garden, organizationId: 'org-other' }),
      list: listOrg,
      persist,
      nextId: () => 'id-1',
      now: () => '2025-01-15T11:00:00.000Z',
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('PROJECT_NOT_FOUND');
    }
    expect(plans).toHaveLength(0);
  });

  it('returns the current project with no event and no persist when nothing changed', async () => {
    const { persist, plans } = createInMemoryPersist();

    const result = await handleUpdateProject(
      { ...command, name: garden.name, objective: garden.objective ?? null },
      {
        load: loadGarden,
        list: listOrg,
        persist,
        nextId: () => 'id-1',
        now: () => '2025-01-15T11:00:00.000Z',
      }
    );

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.event).toBeUndefined();
      expect(result.value.view).toEqual(garden);
    }
    expect(plans).toHaveLength(0);
  });
});

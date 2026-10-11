import { errAsync, okAsync, type ResultAsync } from 'neverthrow';
import type { Project } from '@yoink/api-contracts';
import type { ProjectStore } from '../domain/project-store.js';
import { storageError, type StorageError } from '../domain/project-errors.js';
import type { KeysetCursor } from '../../listing/domain/keyset-cursor.js';
import type { KeysetRows } from '../../listing/domain/listed-page.js';

export type FakeProjectStore = ProjectStore & {
  captureSnapshot: () => () => void;
  hasActive: (id: string) => boolean;
  applyInsert: (project: Project) => void;
  applyReplace: (project: Project) => void;
  applyClearNextAction: (input: {
    projectId: string;
    previousTaskId: string;
    lastChangedAt: string | null;
    lastChangedBy: string | null;
  }) => boolean;
  applySetNextAction: (input: {
    projectId: string;
    nextActionTaskId: string;
    lastChangedAt: string | null;
    lastChangedBy: string | null;
  }) => boolean;
};

export const createFakeProjectStore = (initial: Project[] = []): FakeProjectStore => {
  const projects: Project[] = [...initial];

  return {
    captureSnapshot: () => {
      const copy = projects.map((project) => ({ ...project }));
      return () => {
        projects.length = 0;
        projects.push(...copy);
      };
    },
    hasActive: (id: string) => projects.some((project) => project.id === id),
    applyInsert: (project: Project) => {
      projects.push(project);
    },
    applyReplace: (project: Project) => {
      const index = projects.findIndex((item) => item.id === project.id);
      if (index !== -1) {
        projects[index] = project;
      }
    },
    applyClearNextAction: (input) => {
      const index = projects.findIndex((item) => item.id === input.projectId);
      const current = index === -1 ? undefined : projects[index];
      if (!current || current.nextActionTaskId !== input.previousTaskId) {
        return false;
      }
      projects[index] = {
        ...current,
        nextActionTaskId: null,
        lastChangedAt: input.lastChangedAt,
        lastChangedBy: input.lastChangedBy,
      };
      return true;
    },
    applySetNextAction: (input) => {
      const index = projects.findIndex((item) => item.id === input.projectId);
      const current = index === -1 ? undefined : projects[index];
      if (!current || current.status === 'done') {
        return false;
      }
      projects[index] = {
        ...current,
        nextActionTaskId: input.nextActionTaskId,
        lastChangedAt: input.lastChangedAt,
        lastChangedBy: input.lastChangedBy,
      };
      return true;
    },
    findById: (id: string): ResultAsync<Project | null, StorageError> =>
      okAsync(projects.find((project) => project.id === id) ?? null),
    findByOrganization: (organizationId: string): ResultAsync<Project[], StorageError> =>
      okAsync(projects.filter((project) => project.organizationId === organizationId)),
    pageByOrganization: (_options: {
      organizationId: string;
      fetchLimit: number;
      seek?: KeysetCursor;
    }): ResultAsync<KeysetRows<Project>, StorageError> =>
      errAsync(storageError('Fake project store does not page')),
  };
};

import type { Project } from '@yoink/api-contracts';

/** Pending proposals, by name. The default project list stays unchanged. */
export function proposedProjectsByName(projects: readonly Project[]): Project[] {
  return projects
    .filter((project) => project.status === 'proposed')
    .toSorted((left, right) => left.name.localeCompare(right.name));
}

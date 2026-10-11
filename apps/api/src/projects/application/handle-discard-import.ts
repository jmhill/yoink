import { errAsync, type ResultAsync } from 'neverthrow';
import type { Actor } from '../../shared/auth-context.js';
import type { DiscardedImport } from '@yoink/api-contracts';
import { requirePerson } from '../../shared/auth-context.js';
import {
  importNotFoundError,
  importNotPendingError,
  importRequiresPersonError,
  type DiscardImportError,
} from '../domain/project-errors.js';
import type { LoadStagedImport, PersistImportDiscard } from './ports.js';

export type HandleDiscardImportDeps = {
  loadImport: LoadStagedImport;
  persistDiscard: PersistImportDiscard;
  now: () => string;
};

export const handleDiscardImport = (
  command: { id: string; organizationId: string; actor: Actor },
  deps: HandleDiscardImportDeps
): ResultAsync<DiscardedImport, DiscardImportError> => {
  const person = requirePerson(command.actor);
  if (person.isErr()) {
    return errAsync(importRequiresPersonError());
  }

  return deps.loadImport(command.id).andThen((loaded) => {
    if (!loaded || loaded.organizationId !== command.organizationId) {
      return errAsync(importNotFoundError(command.id));
    }
    if (loaded.status !== 'pending') {
      return errAsync(importNotPendingError());
    }

    const decidedAt = deps.now();
    return deps
      .persistDiscard({
        id: loaded.id,
        organizationId: command.organizationId,
        decidedById: person.value.userId,
        decidedAt,
      })
      .map(() => ({
        id: loaded.id,
        status: 'discarded' as const,
        decidedById: person.value.userId,
        decidedAt,
      }));
  });
};

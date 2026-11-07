import type { ModuleName } from '../../kernel/module-name.js';

/** Wiring error. Two participants for one module cannot both own the step. */
export const indexParticipants = <T extends { readonly owner: ModuleName }>(
  participants: readonly T[]
): ReadonlyMap<ModuleName, T> => {
  const byOwner = new Map<ModuleName, T>();
  for (const participant of participants) {
    if (byOwner.has(participant.owner)) {
      throw new Error(`Duplicate unit-of-work participant: ${participant.owner}`);
    }
    byOwner.set(participant.owner, participant);
  }
  return byOwner;
};

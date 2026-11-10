import type { FakeParticipant } from '../../../../kernel/unit-of-work.js';
import type { FakeNotesStore } from './fake-notes-backend.js';

/** Snapshot is the store's copy. The unit of work restores it. */
export const createFakeNotesParticipant = (store: FakeNotesStore): FakeParticipant<unknown> => ({
  owner: 'notes',
  snapshot: () => store.snapshot(),
  apply: (plan) => store.apply(plan),
});

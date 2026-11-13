/**
 * Snapshots a fake store can register for the current test. The Vitest setup
 * file reads the same global symbol and prints it only when a test fails.
 * Keep the symbol in sync with scripts/vitest-failure-diagnostics.ts.
 */
const FAILURE_STATE = Symbol.for('yoink.failureState');

type Snapshot = () => unknown | Promise<unknown>;

type Slot = {
  label: string;
  read: Snapshot;
};

type Registry = {
  slots: Slot[];
  seq: number;
};

const registry = (): Registry => {
  const host = globalThis as { [FAILURE_STATE]?: Registry };
  const existing = host[FAILURE_STATE];
  if (existing) {
    return existing;
  }
  const created: Registry = { slots: [], seq: 0 };
  host[FAILURE_STATE] = created;
  return created;
};

export const registerFailureState = (label: string, read: Snapshot): void => {
  const current = registry();
  current.slots.push({ label: `${label}#${current.seq}`, read });
  current.seq += 1;
};

export const clearFailureState = (): void => {
  const current = registry();
  current.slots.length = 0;
  current.seq = 0;
};

export const readFailureState = async (): Promise<Record<string, unknown>> => {
  const slots = [...registry().slots];
  const state: Record<string, unknown> = {};
  for (const slot of slots) {
    try {
      state[slot.label] = await slot.read();
    } catch (error) {
      state[slot.label] = {
        readError: error instanceof Error ? error.message : String(error),
      };
    }
  }
  return state;
};

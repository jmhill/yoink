import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { beforeEach, onTestFailed } from 'vitest';

/**
 * Reads fake-store snapshots registered by apps/api. The symbol must stay in
 * sync with apps/api/src/platform/testing/failure-state.ts.
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

type FailedTask = {
  name: string;
  suite?: FailedTask;
  result?: {
    state?: string;
    startTime?: number;
    errors?: readonly { message?: string }[];
  };
};

type WorkerState = {
  config?: {
    sequence?: {
      seed?: number;
    };
  };
};

const registryOf = (): Registry | undefined =>
  (globalThis as { [FAILURE_STATE]?: Registry })[FAILURE_STATE];

const clearRegistry = (): void => {
  const current = registryOf();
  if (!current) {
    return;
  }
  current.slots.length = 0;
  current.seq = 0;
};

const readRegistry = async (): Promise<Record<string, unknown>> => {
  const slots = [...(registryOf()?.slots ?? [])];
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

const sequenceSeed = (): number | null => {
  const worker = (globalThis as { __vitest_worker__?: WorkerState }).__vitest_worker__;
  const seed = worker?.config?.sequence?.seed;
  return typeof seed === 'number' ? seed : null;
};

const titleOf = (task: FailedTask): string => {
  const names: string[] = [];
  let current: FailedTask | undefined = task;
  while (current) {
    if (current.name.length > 0) {
      names.push(current.name);
    }
    current = current.suite;
  }
  return names.reverse().join(' > ');
};

const slug = (name: string): string => {
  const clean = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return `${Date.now()}-${clean || 'test'}`;
};

const writeFailure = async (task: FailedTask): Promise<void> => {
  const started = task.result?.startTime;
  const finishedAt = Date.now();
  const durationMs = typeof started === 'number' ? finishedAt - started : undefined;
  const fakeStores = await readRegistry();
  const report = {
    test: titleOf(task),
    state: task.result?.state ?? 'fail',
    startedAt: typeof started === 'number' ? new Date(started).toISOString() : undefined,
    finishedAt: new Date(finishedAt).toISOString(),
    durationMs,
    sequenceSeed: sequenceSeed(),
    shuffle: sequenceSeed() === null ? 'off' : 'on',
    poolId: process.env.VITEST_POOL_ID ?? null,
    errors: (task.result?.errors ?? []).flatMap((error) =>
      error.message ? [error.message] : []
    ),
    fakeStores,
  };
  const dir = join(process.cwd(), 'failure-diagnostics');
  await mkdir(dir, { recursive: true });
  const file = join(dir, `${slug(report.test)}.json`);
  await writeFile(file, `${JSON.stringify(report, null, 2)}\n`);
  console.error(
    JSON.stringify({
      msg: 'vitest_failure',
      file,
      test: report.test,
      durationMs,
      sequenceSeed: report.sequenceSeed,
      fakeStores: Object.keys(fakeStores),
    })
  );
};

beforeEach((ctx: { task: FailedTask }) => {
  clearRegistry();
  onTestFailed(async () => {
    try {
      await writeFailure(ctx.task);
    } catch (error) {
      console.error('failure diagnostics failed', error);
    }
  });
});

import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ESLint } from 'eslint';
import { afterEach, describe, expect, it } from 'vitest';
import config from './eslint.config.js';

// Lives outside src/ so the production lint census does not count these
// fixtures. The config's element patterns stay `src/...`; only root-path
// points at the temp tree, so the rules under test are the ones in
// eslint.config.js.

const boundariesRules = new Set([
  'boundaries/element-types',
  'boundaries/entry-point',
  'boundaries/external',
  'boundaries/no-unknown',
  'no-restricted-imports',
]);

let tempRoot: string | undefined;

afterEach(async () => {
  if (tempRoot) {
    await rm(tempRoot, { recursive: true, force: true });
    tempRoot = undefined;
  }
});

function withRoot(root: string) {
  return config.map((block) => {
    const settings = block.settings;
    if (!settings?.['boundaries/root-path']) {
      return block;
    }
    return {
      ...block,
      settings: {
        ...settings,
        'boundaries/root-path': root,
      },
    };
  });
}

async function writeTree(files: Record<string, string>) {
  tempRoot = await mkdtemp(path.join(os.tmpdir(), 'yoink-boundaries-'));
  await Promise.all(
    Object.entries(files).map(async ([relativePath, source]) => {
      const fullPath = path.join(tempRoot!, relativePath);
      await mkdir(path.dirname(fullPath), { recursive: true });
      await writeFile(fullPath, source);
    }),
  );
  return tempRoot;
}

async function lintBoundaries(root: string) {
  const eslint = new ESLint({
    cwd: root,
    overrideConfigFile: true,
    overrideConfig: withRoot(root),
    errorOnUnmatchedPattern: true,
  });
  const results = await eslint.lintFiles(['src/**/*.ts']);
  const byFile = new Map<string, { ruleId: string; message: string }[]>();
  for (const result of results) {
    const relativePath = path.relative(root, result.filePath);
    const messages = result.messages
      .filter((message) => message.ruleId && boundariesRules.has(message.ruleId))
      .map((message) => ({
        ruleId: message.ruleId as string,
        message: message.message,
      }));
    byFile.set(relativePath, messages);
  }
  return byFile;
}

describe('boundaries target rules', () => {
  it('allows same-edge and same-module fakes, and warns on the forbidden cases', async () => {
    const root = await writeTree({
      'src/edges/web/routes.ts': `
        import { mapEdge } from './map.js';
        export { mapEdge } from './map.js';
        export { adminMap } from '../admin/map.js';
        export const routes = { mapEdge };
      `,
      'src/edges/web/map.ts': `export const mapEdge = {};\n`,
      'src/edges/admin/map.ts': `export const adminMap = {};\n`,
      'src/modules/access/testing.ts': `
        export { fakeStore } from './infrastructure/fakes/store.js';
        export { sqlite } from './infrastructure/sqlite.js';
        export { otherFake } from '../inbox/infrastructure/fakes/store.js';
      `,
      'src/modules/access/infrastructure/fakes/store.ts': `export const fakeStore = {};\n`,
      'src/modules/access/infrastructure/sqlite.ts': `export const sqlite = {};\n`,
      'src/modules/access/application/use.ts': `export const useCase = {};\n`,
      'src/modules/access/application/leak.ts': `
        export { sqlite } from '../infrastructure/sqlite.js';
      `,
      'src/modules/access/index.ts': `
        export { useCase } from './application/use.js';
        export { sqlite } from './infrastructure/sqlite.js';
      `,
      'src/modules/access/domain/model.ts': `
        export type { Capture } from '@yoink/api-contracts';
      `,
      'src/modules/inbox/infrastructure/fakes/store.ts': `export const otherFake = {};\n`,
      'src/modules/inbox/domain/other.ts': `
        export { access } from '../../access/index.js';
      `,
      'src/modules/inbox/index.ts': `export const access = {};\n`,
      'src/workflows/processing/application/run.ts': `export const run = {};\n`,
      'src/workflows/processing/index.ts': `
        export { run } from './application/run.js';
      `,
    });

    const diagnostics = await lintBoundaries(root);
    const messagesFor = (relativePath: string) => diagnostics.get(relativePath) ?? [];

    expect(messagesFor('src/edges/web/map.ts')).toEqual([]);
    expect(messagesFor('src/edges/web/routes.ts')).toEqual([
      expect.objectContaining({
        ruleId: 'boundaries/element-types',
        message: expect.stringContaining("edge 'admin'"),
      }),
    ]);
    expect(messagesFor('src/modules/access/testing.ts')).toEqual([
      expect.objectContaining({
        ruleId: 'boundaries/element-types',
        message: expect.stringContaining("type 'module-infrastructure'"),
      }),
      expect.objectContaining({
        ruleId: 'boundaries/element-types',
        message: expect.stringContaining("module 'inbox'"),
      }),
    ]);
    expect(messagesFor('src/modules/access/index.ts')).toEqual([
      expect.objectContaining({
        ruleId: 'boundaries/element-types',
        message: expect.stringContaining("type 'module-infrastructure'"),
      }),
    ]);
    expect(messagesFor('src/modules/access/domain/model.ts')).toEqual([
      expect.objectContaining({
        ruleId: 'boundaries/external',
        message: expect.stringContaining("'@yoink/api-contracts'"),
      }),
    ]);
    expect(messagesFor('src/modules/inbox/domain/other.ts')).toEqual([
      expect.objectContaining({
        ruleId: 'boundaries/element-types',
        message: expect.stringContaining("type 'module-entry'"),
      }),
    ]);
    expect(messagesFor('src/workflows/processing/index.ts')).toEqual([]);
    expect(messagesFor('src/modules/access/application/use.ts')).toEqual([]);
    expect(messagesFor('src/modules/access/application/leak.ts')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ruleId: 'no-restricted-imports',
        }),
        expect.objectContaining({
          ruleId: 'boundaries/element-types',
          message: expect.stringContaining("type 'module-infrastructure'"),
        }),
      ]),
    );
    expect(messagesFor('src/modules/access/application/leak.ts')).toHaveLength(2);
    expect(messagesFor('src/modules/access/infrastructure/fakes/store.ts')).toEqual([]);
    expect(messagesFor('src/modules/access/infrastructure/sqlite.ts')).toEqual([]);
  });

  it('lets current code import kernel and keeps kernel on neverthrow and zod', async () => {
    const root = await writeTree({
      'src/kernel/ok.ts': `export const ok = 1;\n`,
      'src/kernel/listing/cursor.ts': `
        import { ok } from 'neverthrow';
        import { z } from 'zod';
        import { ok as kernelOk } from '../ok.js';
        export const cursor = { ok, z, kernelOk };
      `,
      'src/kernel/leak.ts': `
        export type { Task } from '@yoink/api-contracts';
        export { model } from '../captures/domain/model.js';
        import { readFileSync } from 'node:fs';
        export const bytes = readFileSync;
      `,
      'src/captures/domain/model.ts': `
        import { ok } from '../../kernel/ok.js';
        export const model = { ok };
      `,
    });

    const diagnostics = await lintBoundaries(root);
    const messagesFor = (relativePath: string) => diagnostics.get(relativePath) ?? [];

    expect(messagesFor('src/kernel/ok.ts')).toEqual([]);
    expect(messagesFor('src/kernel/listing/cursor.ts')).toEqual([]);
    expect(messagesFor('src/captures/domain/model.ts')).toEqual([]);
    expect(messagesFor('src/kernel/leak.ts')).toEqual([
      expect.objectContaining({
        ruleId: 'boundaries/external',
        message: expect.stringContaining("'@yoink/api-contracts'"),
      }),
      expect.objectContaining({
        ruleId: 'boundaries/element-types',
        message: expect.stringContaining("type 'captures'"),
      }),
      expect.objectContaining({
        ruleId: 'boundaries/external',
        message: expect.stringContaining('node:fs'),
      }),
    ]);
  });

  it('lets current code import platform and keeps kernel and platform from crossing', async () => {
    const root = await writeTree({
      'src/platform/database/types.ts':
        'export type Database = { execute(sql: string): Promise<void> };\n',
      'src/platform/health/checker.ts': `
        import type { Database } from '../database/types.js';
        export const check = (database: Database) => database;
      `,
      'src/kernel/pure.ts': `
        import type { Database } from '../platform/database/types.js';
        export type Leak = Database;
      `,
      'src/captures/infrastructure/store.ts': `
        import type { Database } from '../../platform/database/types.js';
        export const store = (database: Database) => database;
      `,
      'src/captures/domain/model.ts': 'export const model = {};\n',
      'src/platform/leak.ts': `
        import { model } from '../captures/domain/model.js';
        export const leak = model;
      `,
    });

    const diagnostics = await lintBoundaries(root);
    const messagesFor = (relativePath: string) => diagnostics.get(relativePath) ?? [];

    expect(messagesFor('src/platform/health/checker.ts')).toEqual([]);
    expect(messagesFor('src/captures/infrastructure/store.ts')).toEqual([]);
    expect(messagesFor('src/kernel/pure.ts')).toEqual([
      expect.objectContaining({
        ruleId: 'boundaries/element-types',
        message: expect.stringContaining("type 'platform-database'"),
      }),
    ]);
    expect(messagesFor('src/platform/leak.ts')).toEqual([
      expect.objectContaining({
        ruleId: 'boundaries/element-types',
        message: expect.stringContaining("type 'captures'"),
      }),
    ]);
  });

  it('rejects a domain or application runtime import of @yoink/infrastructure', async () => {
    const root = await writeTree({
      'src/kernel/clock.ts': 'export type Clock = { now(): Date };\n',
      'src/access/domain/passkey.ts': `
        import { createSystemClock } from '@yoink/infrastructure';
        export const clock = createSystemClock;
      `,
      'src/access/domain/ports.ts': `
        import type { Clock } from '../../kernel/clock.js';
        export const read = (clock: Clock) => clock.now();
      `,
      'src/access/domain/passkey.test.ts': `
        import { createFakeClock } from '@yoink/infrastructure';
        export const clock = createFakeClock;
      `,
      'src/access/application/routes.ts': `
        import { createUuidGenerator } from '@yoink/infrastructure';
        export const ids = createUuidGenerator;
      `,
    });

    const diagnostics = await lintBoundaries(root);
    const messagesFor = (relativePath: string) => diagnostics.get(relativePath) ?? [];

    expect(messagesFor('src/access/domain/ports.ts')).toEqual([]);
    expect(messagesFor('src/access/domain/passkey.test.ts')).toEqual([]);
    expect(messagesFor('src/access/domain/passkey.ts')).toEqual([
      expect.objectContaining({
        ruleId: 'no-restricted-imports',
        message: expect.stringContaining('@yoink/infrastructure'),
      }),
    ]);
    expect(messagesFor('src/access/application/routes.ts')).toEqual([
      expect.objectContaining({
        ruleId: 'no-restricted-imports',
        message: expect.stringContaining('@yoink/infrastructure'),
      }),
    ]);
  });

  it('keeps edge helpers shared by edges and out of domain and kernel', async () => {
    const root = await writeTree({
      'src/kernel/clock.ts': 'export type Clock = { now(): Date };\n',
      'src/edges/_shared/http.ts': `
        import type { Clock } from '../../kernel/clock.js';
        export const read = (clock: Clock) => clock.now();
      `,
      'src/edges/_shared/leak-db.ts': `
        import type { Database } from '../../platform/database/types.js';
        export type Leak = Database;
      `,
      'src/platform/database/types.ts': 'export type Database = { execute(sql: string): Promise<void> };\n',
      'src/tasks/infrastructure/routes.ts': `
        import { read } from '../../edges/_shared/http.js';
        export const routes = { read };
      `,
      'src/lists/domain/policy.ts': `
        import { read } from '../../edges/_shared/http.js';
        export const policy = { read };
      `,
      'src/kernel/pull.ts': `
        import { read } from '../edges/_shared/http.js';
        export const pulled = read;
      `,
    });

    const diagnostics = await lintBoundaries(root);
    const messagesFor = (relativePath: string) => diagnostics.get(relativePath) ?? [];

    expect(messagesFor('src/edges/_shared/http.ts')).toEqual([]);
    expect(messagesFor('src/tasks/infrastructure/routes.ts')).toEqual([]);
    expect(messagesFor('src/edges/_shared/leak-db.ts')).toEqual([
      expect.objectContaining({
        ruleId: 'boundaries/element-types',
        message: expect.stringContaining("type 'platform-database'"),
      }),
    ]);
    expect(messagesFor('src/lists/domain/policy.ts')).toEqual([
      expect.objectContaining({
        ruleId: 'no-restricted-imports',
        message: expect.stringContaining('edge HTTP helpers'),
      }),
    ]);
    expect(messagesFor('src/kernel/pull.ts')).toEqual([
      expect.objectContaining({
        ruleId: 'boundaries/element-types',
        message: expect.stringContaining("type 'edge-shared'"),
      }),
    ]);
  });
});

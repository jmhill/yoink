import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ProcedureContract, type AnyProcedureContract } from '@orpc/contract';
import { getOpenAPIMeta } from '@orpc/openapi';
import type { ZodTypeAny } from 'zod';
import { describe, expect, it } from 'vitest';
import { adminProtectedOrpcContract, adminPublicOrpcContract } from '../../orpc/admin-contract.js';
import { authOrpcContract } from '../../orpc/auth-contract.js';
import {
  captureOrpcContract,
  processCaptureToProjectOrpcContract,
} from '../../orpc/capture-contract.js';
import { healthOrpcContract } from '../../orpc/health-contract.js';
import { invitationOrpcContract } from '../../orpc/invitation-contract.js';
import { listOrpcContract } from '../../orpc/list-contract.js';
import { noteOrpcContract } from '../../orpc/note-contract.js';
import { organizationOrpcContract } from '../../orpc/organization-contract.js';
import { passkeyOrpcContract } from '../../orpc/passkey-contract.js';
import { projectOrpcContract } from '../../orpc/project-contract.js';
import { reviewOrpcContract } from '../../orpc/review-contract.js';
import { signupOrpcContract } from '../../orpc/signup-contract.js';
import { taskOrpcContract } from '../../orpc/task-contract.js';
import { tokenOrpcContract } from '../../orpc/token-contract.js';
import { workOrpcContract } from '../../orpc/work-contract.js';
import { publicApiV1Contract } from './contract.js';
import { frozenContractShape } from './frozen-contract.js';
import { collectSchemas } from './schema-freeze.js';

const inventoryPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../../docs/architecture/adr/001-route-inventory.md',
);

type Classification = 'integration' | 'client-only' | 'ops' | 'test fixture';

type ClassifiedRoute = {
  method: string;
  path: string;
  classification: Classification;
};

const classifications = new Set<Classification>(['integration', 'client-only', 'ops', 'test fixture']);

const inventoryRoutes = (markdown: string): ClassifiedRoute[] => {
  const routes: ClassifiedRoute[] = [];
  for (const line of markdown.split('\n')) {
    if (!line.startsWith('| ')) continue;
    const cells = line.split('|').map((cell) => cell.trim());
    const methodAndPath = cells[1] ?? '';
    const classification = cells[6];
    const match = /^(GET|POST|PUT|PATCH|DELETE) (\/\S+)$/.exec(methodAndPath);
    if (match === null) continue;
    if (!classifications.has(classification as Classification)) {
      throw new Error(`inventory row ${methodAndPath} has classification ${String(classification)}`);
    }
    routes.push({
      method: match[1] ?? '',
      path: match[2] ?? '',
      classification: classification as Classification,
    });
  }
  return routes;
};

const routeKey = (method: string, path: string) => `${method} ${path}`;

type ListedProcedure = {
  procedure: AnyProcedureContract;
  method: string;
  path: string;
};

const listProcedures = (router: unknown): ListedProcedure[] => {
  if (router instanceof ProcedureContract) {
    const meta = getOpenAPIMeta(router);
    return [{ procedure: router, method: meta?.method ?? '', path: meta?.path ?? '' }];
  }
  if (typeof router !== 'object' || router === null) return [];
  return Object.values(router).flatMap((value) => listProcedures(value));
};

const legacyRouters = [
  adminPublicOrpcContract,
  adminProtectedOrpcContract,
  authOrpcContract,
  captureOrpcContract,
  processCaptureToProjectOrpcContract,
  healthOrpcContract,
  invitationOrpcContract,
  listOrpcContract,
  noteOrpcContract,
  organizationOrpcContract,
  passkeyOrpcContract,
  projectOrpcContract,
  reviewOrpcContract,
  signupOrpcContract,
  taskOrpcContract,
  tokenOrpcContract,
  workOrpcContract,
];

const schemasOf = (procedure: AnyProcedureContract): ZodTypeAny[] => {
  const definition = procedure['~orpc'];
  return [
    ...((definition.inputSchemas ?? []) as ZodTypeAny[]),
    ...((definition.outputSchemas ?? []) as ZodTypeAny[]),
  ];
};

describe('public API v1 contracts', () => {
  const inventory = inventoryRoutes(readFileSync(inventoryPath, 'utf8'));
  const byClass = (classification: Classification) =>
    inventory.filter((route) => route.classification === classification);
  const legacy = listProcedures(legacyRouters);
  const frozen = listProcedures(publicApiV1Contract);
  const legacyByKey = new Map(legacy.map((procedure) => [routeKey(procedure.method, procedure.path), procedure]));

  it('reads every inventory row once', () => {
    expect(byClass('integration')).toHaveLength(59);
    expect(byClass('client-only')).toHaveLength(45);
    expect(byClass('ops')).toHaveLength(1);
    expect(byClass('test fixture')).toHaveLength(5);
    expect(inventory).toHaveLength(110);
    expect(new Set(inventory.map((route) => routeKey(route.method, route.path))).size).toBe(110);
  });

  it('copies exactly the integration procedures onto the resource path', () => {
    const integrationKeys = byClass('integration').map((route) => routeKey(route.method, route.path));
    const frozenLegacyKeys = frozen.map((procedure) => {
      expect(procedure.path.startsWith('/api')).toBe(false);
      expect(procedure.path.startsWith('/v1')).toBe(false);
      return routeKey(procedure.method, `/api${procedure.path}`);
    });

    expect(frozenLegacyKeys).toHaveLength(59);
    expect(new Set(frozenLegacyKeys)).toEqual(new Set(integrationKeys));
    expect(legacy).toHaveLength(105);
  });

  it('pins procedure shape to the checked-in freeze, not the live legacy schemas', () => {
    const pin = JSON.parse(readFileSync(new URL('./frozen-shape.json', import.meta.url), 'utf8')) as unknown;
    expect(frozenContractShape(publicApiV1Contract)).toEqual(pin);
  });

  it('does not share Zod schema objects with the legacy procedures', () => {
    const frozenSchemas = new Set<ZodTypeAny>();
    for (const procedure of frozen) {
      for (const schema of schemasOf(procedure.procedure)) collectSchemas(schema, frozenSchemas);
    }
    const shared: string[] = [];
    for (const procedure of frozen) {
      const source = legacyByKey.get(routeKey(procedure.method, `/api${procedure.path}`));
      expect(source, procedure.path).toBeDefined();
      if (source === undefined) continue;
      for (const schema of schemasOf(source.procedure)) {
        for (const nested of collectSchemas(schema)) {
          if (frozenSchemas.has(nested)) shared.push(routeKey(procedure.method, procedure.path));
        }
      }
    }
    expect(shared).toEqual([]);
  });

  it('keeps refinement and default behavior on the frozen inputs', () => {
    const input = (method: string, path: string): ZodTypeAny => {
      const procedure = frozen.find((item) => item.method === method && item.path === path);
      const schema = procedure?.procedure['~orpc'].inputSchemas?.[0] as ZodTypeAny | undefined;
      if (schema === undefined) throw new Error(`missing ${method} ${path}`);
      return schema;
    };
    const id = '550e8400-e29b-41d4-a716-446655440000';
    const noteUpdate = input('PATCH', '/projects/{projectId}/notes/{noteId}');
    expect(noteUpdate.safeParse({ projectId: id, noteId: id, expectedVersion: '1' }).success).toBe(false);
    expect(noteUpdate.safeParse({ projectId: id, noteId: id, expectedVersion: '1', title: 'A note' }).success).toBe(true);

    const imported = input('POST', '/notes/import');
    expect(imported.safeParse({ projectId: id, noteId: id, title: 'A note', body: 'body' }).success).toBe(false);
    expect(imported.safeParse({ projectId: id, noteId: id, title: 'A note', body: 'body', baseVersion: '1' }).success).toBe(true);

    const projectUpdate = input('PATCH', '/projects/{id}');
    expect(projectUpdate.safeParse({ id }).success).toBe(false);
    expect(projectUpdate.safeParse({ id, name: 'Name' }).success).toBe(true);

    const due = input('GET', '/work/due');
    expect(due.parse({})).toEqual({ owner: 'all' });
    expect(due.safeParse({ timeZone: 'America/Chicago' }).success).toBe(true);
    expect(due.safeParse({ timeZone: 'Mars/Base' }).success).toBe(false);

    const review = input('GET', '/review');
    expect(review.safeParse({ timeZone: 'UTC' }).success).toBe(true);
    expect(review.safeParse({ timeZone: 'Mars/Base' }).success).toBe(false);
  });

  it('leaves token writes, agent token writes, client-only routes, health, and fixtures out', () => {
    const frozenKeys = new Set(frozen.map((procedure) => routeKey(procedure.method, `/api${procedure.path}`)));
    const excluded = [
      'POST /api/auth/tokens',
      'DELETE /api/auth/tokens/{tokenId}',
      'POST /api/organizations/{organizationId}/agents',
      'POST /api/organizations/{organizationId}/members/{userId}/token',
      'GET /api/health',
      'POST /api/admin/login',
      'POST /api/auth/login/options',
      'POST /api/invitations',
      'POST /api/organizations/switch',
      'POST /api/test/review-fixture/backdate',
      'POST /api/test/ownerless-workspace',
    ];

    expect(frozenKeys.has('GET /api/auth/tokens')).toBe(true);
    for (const key of excluded) {
      expect(frozenKeys.has(key), key).toBe(false);
    }

    for (const route of inventory) {
      if (route.classification === 'integration') continue;
      expect(frozenKeys.has(routeKey(route.method, route.path)), routeKey(route.method, route.path)).toBe(false);
    }
  });
});

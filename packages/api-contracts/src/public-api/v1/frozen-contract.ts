import { ProcedureContract, type AnyProcedureContract } from '@orpc/contract';
import { getOpenAPIMeta } from '@orpc/openapi';
import type { ZodTypeAny } from 'zod';
import { schemaShape } from './schema-freeze.js';

const listProcedures = (router: unknown, key: string[] = []): { key: string; procedure: AnyProcedureContract }[] => {
  if (router instanceof ProcedureContract) return [{ key: key.join('.'), procedure: router }];
  if (typeof router !== 'object' || router === null) return [];
  return Object.entries(router).flatMap(([name, value]) => listProcedures(value, [...key, name]));
};

const openApiShape = (procedure: AnyProcedureContract): Record<string, unknown> => {
  const meta = getOpenAPIMeta(procedure) as Record<string, unknown> | undefined;
  if (meta === undefined) return {};
  const known = [
    'method',
    'path',
    'operationId',
    'summary',
    'description',
    'deprecated',
    'tags',
    'successStatus',
    'successDescription',
    'paramsStyles',
    'queryStyles',
    'inputStructure',
    'outputStructure',
    'prefix',
    'spec',
  ];
  const extra = Object.keys(meta).filter((key) => !known.includes(key));
  if (extra.length > 0) throw new Error(`public v1 freeze does not know OpenAPI meta ${extra.join(', ')}`);
  const shape: Record<string, unknown> = {};
  for (const key of known) {
    if (meta[key] !== undefined) shape[key] = meta[key];
  }
  return shape;
};

const schemasShape = (schemas: readonly ZodTypeAny[] | undefined): unknown =>
  schemas === undefined ? null : schemas.map((schema) => schemaShape(schema));

/** Structural pin of the frozen router. Independent of the legacy schema objects. */
export const frozenContractShape = (router: unknown): { procedures: unknown[] } => ({
  procedures: listProcedures(router)
    .map(({ key, procedure }) => ({
      routerKey: key,
      openapi: openApiShape(procedure),
      errorMap: procedure['~orpc'].errorMap,
      input: schemasShape(procedure['~orpc'].inputSchemas as readonly ZodTypeAny[] | undefined),
      output: schemasShape(procedure['~orpc'].outputSchemas as readonly ZodTypeAny[] | undefined),
    }))
    .sort((left, right) => JSON.stringify(left.openapi).localeCompare(JSON.stringify(right.openapi))),
});

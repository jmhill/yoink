import {
  ProcedureContract,
  type AnySchema,
  type ErrorMap,
} from '@orpc/contract';
import { getOpenAPIMeta, openapi } from '@orpc/openapi';
import type { ZodTypeAny } from 'zod';
import { detachSchema } from './schema-freeze.js';

const API_PREFIX = '/api';

/**
 * Copy one legacy procedure onto the public v1 resource path.
 *
 * M0.3 measured that a spread keeps each procedure's path, and that a path
 * which already contains `/api/v1` matches only that URL. The contract path
 * is the legacy path with `/api` removed (`/api/captures` becomes
 * `/captures`). M3.2 passes `/api/v1` or `/api` to `handle`. Input and
 * output schemas are detached copies, so a later edit of the legacy Zod
 * object does not change this procedure. `frozen-shape.json` pins the shape.
 */
export const withResourcePath = <
  TInput extends AnySchema,
  TOutput extends AnySchema,
  TErrors extends ErrorMap,
>(
  procedure: ProcedureContract<TInput, TOutput, TErrors>,
): ProcedureContract<TInput, TOutput, TErrors> => {
  const definition = procedure['~orpc'];
  const legacyPath = getOpenAPIMeta(procedure)?.path;
  if (legacyPath === undefined || !legacyPath.startsWith(`${API_PREFIX}/`)) {
    throw new Error(`public v1 contract is not under /api: ${legacyPath ?? '(missing path)'}`);
  }
  const path = legacyPath.slice(API_PREFIX.length) as `/${string}`;
  const plugin = openapi.path(path);
  if (plugin.init === undefined) {
    throw new Error('openapi path plugin has no init');
  }
  const isolateOpenApi = {
    name: '~openapi/v1-isolate',
    init(meta: { '~openapi'?: unknown }) {
      const openApi = meta['~openapi'];
      if (typeof openApi !== 'object' || openApi === null) return meta;
      const copied = { ...(openApi as Record<string, unknown>) };
      if (typeof copied.queryStyles === 'object' && copied.queryStyles !== null) {
        copied.queryStyles = { ...(copied.queryStyles as Record<string, unknown>) };
      }
      if (typeof copied.paramsStyles === 'object' && copied.paramsStyles !== null) {
        copied.paramsStyles = { ...(copied.paramsStyles as Record<string, unknown>) };
      }
      if (Array.isArray(copied.tags)) copied.tags = [...copied.tags];
      return { ...meta, '~openapi': copied };
    },
  };
  const meta = isolateOpenApi.init(plugin.init(definition.meta));
  const detachAll = (schemas: AnySchema[] | undefined) => schemas?.map((schema) => detachSchema(schema as ZodTypeAny));
  return new ProcedureContract({
    ...definition,
    inputSchemas: detachAll(definition.inputSchemas),
    outputSchemas: detachAll(definition.outputSchemas),
    errorMap: { ...definition.errorMap },
    meta,
    metaPlugins: [...(definition.metaPlugins ?? []), plugin, isolateOpenApi],
  });
};

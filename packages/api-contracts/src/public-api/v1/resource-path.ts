import {
  ProcedureContract,
  type AnySchema,
  type ErrorMap,
} from '@orpc/contract';
import { getOpenAPIMeta, openapi } from '@orpc/openapi';

const API_PREFIX = '/api';

/**
 * Copy one legacy procedure onto the public v1 resource path.
 *
 * M0.3 measured that a spread keeps each procedure's path, and that a path
 * which already contains `/api/v1` matches only that URL. The contract path
 * is the legacy path with `/api` removed (`/api/captures` becomes
 * `/captures`). M3.2 passes `/api/v1` or `/api` to `handle`. The schemas,
 * error map, and the rest of the OpenAPI meta stay the legacy objects.
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
  return new ProcedureContract({
    ...definition,
    meta: plugin.init(definition.meta),
    metaPlugins: [...(definition.metaPlugins ?? []), plugin],
  });
};

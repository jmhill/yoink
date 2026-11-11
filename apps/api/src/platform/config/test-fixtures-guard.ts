/**
 * Refuse to boot when test fixtures are enabled on a production process.
 *
 * `NODE_ENV` is not the production signal. The API image sets
 * `NODE_ENV=production` (Dockerfile and fly.toml), and e2e runs that image
 * with `YOINK_TEST_FIXTURES=true` and a local file (`DB_PATH`). Fly does not
 * inject `FLY_APP_NAME` there.
 *
 * Production is either of:
 * - `FLY_APP_NAME=jhtc-yoink-api`, which Fly injects on the deployed app
 *   (`app` in fly.toml; the deploy and smoke jobs use that name).
 * - `TURSO_DATABASE_URL` whose host names the `yoink-prod` database
 *   (`libsql://yoink-prod-<org>.….turso.io`). Local files, localhost, and
 *   other Turso names (`jhtc-yoink`, `yoink-m02-spike`, `yoink-dev`) are not
 *   production. The migration job reads `yoink-prod` from `test-migrations.ts`,
 *   which does not start the API.
 *
 * The flag match is the same `=== 'true'` check the composition root uses
 * to register `/test-api`.
 */

const PRODUCTION_FLY_APP_NAME = 'jhtc-yoink-api';

const testFixturesEnabled = (env: NodeJS.ProcessEnv): boolean =>
  env.YOINK_TEST_FIXTURES === 'true';

const productionDatabaseReason = (url: string | undefined): string | undefined => {
  if (url === undefined || url.length === 0) {
    return undefined;
  }
  let hostname: string;
  try {
    hostname = new URL(url).hostname.toLowerCase();
  } catch {
    return url.toLowerCase().includes('yoink-prod')
      ? 'TURSO_DATABASE_URL names the production database yoink-prod'
      : undefined;
  }
  const firstLabel = hostname.split('.')[0] ?? '';
  if (firstLabel === 'yoink-prod' || firstLabel.startsWith('yoink-prod-')) {
    return 'TURSO_DATABASE_URL names the production database yoink-prod';
  }
  return undefined;
};

const productionFixtureBlockReason = (
  env: NodeJS.ProcessEnv
): string | undefined => {
  if (!testFixturesEnabled(env)) {
    return undefined;
  }
  const reasons: string[] = [];
  if (env.FLY_APP_NAME === PRODUCTION_FLY_APP_NAME) {
    reasons.push(`FLY_APP_NAME=${PRODUCTION_FLY_APP_NAME} is the production Fly app`);
  }
  const databaseReason = productionDatabaseReason(env.TURSO_DATABASE_URL);
  if (databaseReason !== undefined) {
    reasons.push(databaseReason);
  }
  if (reasons.length === 0) {
    return undefined;
  }
  return reasons.join('; ');
};

export const assertTestFixturesAllowed = (env: NodeJS.ProcessEnv): void => {
  const reason = productionFixtureBlockReason(env);
  if (reason === undefined) {
    return;
  }
  throw new Error(
    `Refusing to start: YOINK_TEST_FIXTURES=true and ${reason}. ` +
      'Unset YOINK_TEST_FIXTURES before starting this process.'
  );
};

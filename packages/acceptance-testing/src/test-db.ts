import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const UPDATE_USER_NAME_SQL = 'UPDATE users SET name = ? WHERE id = ?';

const DOCKER_UPDATE_SCRIPT = `
import { createClient } from '@libsql/client';
const path = process.env.TEST_DB_CONTAINER_PATH;
const id = process.env.TEST_USER_ID;
const name = process.env.TEST_USER_NAME;
const client = createClient({ url: \`file:\${path}\` });
const result = await client.execute({
  sql: '${UPDATE_USER_NAME_SQL}',
  args: [name, id],
});
if (result.rowsAffected !== 1) {
  throw new Error(\`expected 1 user updated, got \${result.rowsAffected}\`);
}
`.trim();

const updateViaSqliteFile = async (
  dbPath: string,
  userId: string,
  name: string
): Promise<void> => {
  const { DatabaseSync } = await import('node:sqlite');
  const db = new DatabaseSync(dbPath);
  try {
    const result = db.prepare(UPDATE_USER_NAME_SQL).run(name, userId);
    if (result.changes !== 1) {
      throw new Error(`Expected to update 1 user at ${dbPath}, updated ${result.changes}`);
    }
  } finally {
    db.close();
  }
};

const updateViaDockerCompose = async (
  composeFile: string,
  userId: string,
  name: string
): Promise<void> => {
  const service = process.env.TEST_DB_COMPOSE_SERVICE ?? 'api';
  const containerPath = process.env.TEST_DB_CONTAINER_PATH ?? '/app/apps/api/data/captures.db';
  await execFileAsync(
    'docker',
    [
      'compose',
      '-f',
      composeFile,
      'exec',
      '-T',
      '-e',
      `TEST_USER_ID=${userId}`,
      '-e',
      `TEST_USER_NAME=${name}`,
      '-e',
      `TEST_DB_CONTAINER_PATH=${containerPath}`,
      service,
      'node',
      '--input-type=module',
      '-e',
      DOCKER_UPDATE_SCRIPT,
    ],
    { encoding: 'utf8' }
  );
};

/**
 * Test-only write: set a user's display name in the API SQLite database.
 * Playwright signup has no name field, and we do not add a product admin
 * PATCH just so tests can name actors.
 *
 * Set TEST_DB_PATH to a local SQLite file the test process can open, or
 * TEST_DB_COMPOSE_FILE to docker-exec into the E2E API container.
 */
export const setUserDisplayName = async (userId: string, name: string): Promise<void> => {
  const dbPath = process.env.TEST_DB_PATH;
  if (dbPath) {
    await updateViaSqliteFile(dbPath, userId, name);
    return;
  }

  const composeFile = process.env.TEST_DB_COMPOSE_FILE;
  if (composeFile) {
    await updateViaDockerCompose(composeFile, userId, name);
    return;
  }

  throw new Error(
    'Cannot set Playwright display names: set TEST_DB_PATH (local SQLite file) or TEST_DB_COMPOSE_FILE (docker compose E2E).'
  );
};

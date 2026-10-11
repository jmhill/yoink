import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const UPDATE_USER_NAME_SQL = 'UPDATE users SET name = ? WHERE id = ?';
const BUSY_TIMEOUT_MS = 10_000;
const MAX_ATTEMPTS = 8;

const isBusyError = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error);
  return /SQLITE_BUSY|database is locked/i.test(message);
};

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const DOCKER_UPDATE_SCRIPT = `
import { DatabaseSync } from 'node:sqlite';
const path = process.env.TEST_DB_CONTAINER_PATH;
const id = process.env.TEST_USER_ID;
const name = process.env.TEST_USER_NAME;
const db = new DatabaseSync(path, { timeout: ${BUSY_TIMEOUT_MS} });
try {
  const result = db.prepare(${JSON.stringify(UPDATE_USER_NAME_SQL)}).run(name, id);
  if (result.changes !== 1) {
    throw new Error(\`expected 1 user updated, got \${result.changes}\`);
  }
} finally {
  db.close();
}
`.trim();

const updateViaSqliteFile = async (
  dbPath: string,
  userId: string,
  name: string
): Promise<void> => {
  const { DatabaseSync } = await import('node:sqlite');
  const db = new DatabaseSync(dbPath, { timeout: BUSY_TIMEOUT_MS });
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
      '--experimental-sqlite',
      '--input-type=module',
      '-e',
      DOCKER_UPDATE_SCRIPT,
    ],
    { encoding: 'utf8' }
  );
};

const withBusyRetry = async (run: () => Promise<void>): Promise<void> => {
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      await run();
      return;
    } catch (error) {
      lastError = error;
      if (!isBusyError(error) || attempt === MAX_ATTEMPTS) {
        throw error;
      }
      await delay(100 * attempt);
    }
  }
  throw lastError;
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
    await withBusyRetry(() => updateViaSqliteFile(dbPath, userId, name));
    return;
  }

  const composeFile = process.env.TEST_DB_COMPOSE_FILE;
  if (composeFile) {
    await withBusyRetry(() => updateViaDockerCompose(composeFile, userId, name));
    return;
  }

  throw new Error(
    'Cannot set Playwright display names: set TEST_DB_PATH (local SQLite file) or TEST_DB_COMPOSE_FILE (docker compose E2E).'
  );
};

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { BrowserContext, BrowserContextOptions, Page, Request } from '@playwright/test';

export const SLOW_NETWORK_MS = 1000;
export const LOG_WINDOW_PAD_MS = 2000;
const CONSOLE_CAP = 200;
const NETWORK_CAP = 100;

/**
 * Values Playwright would otherwise record from a filled password field.
 * The test process has the admin password. The session and WebAuthn secrets
 * live in the API container; redact them too when this process can see them.
 */
export const SECRET_ENV_KEYS = [
  'TEST_ADMIN_PASSWORD',
  'ADMIN_PASSWORD',
  'SESSION_SECRET',
  'WEBAUTHN_CHALLENGE_SECRET',
] as const;

export type NetworkEntry = {
  method: string;
  url: string;
  durationMs: number;
  status?: number;
  failure?: string;
  slow: boolean;
};

type Observed = {
  context: BrowserContext;
  generation: number;
  consoleLines: string[];
  pageErrors: string[];
  network: NetworkEntry[];
  pending: Promise<unknown>[];
  started: Map<Request, number>;
  seen: WeakSet<Request>;
  watched: WeakSet<Page>;
  discarded: boolean;
};

type SecretEnv = Record<string, string | undefined>;

export const diagnosticsEnabled = (): boolean => process.env.YOINK_E2E_DIAGNOSTICS !== '0';

const diagnosticsRoot = (): string => join(process.cwd(), 'e2e-failure-diagnostics');

const observed: Observed[] = [];
const actors: string[] = [];
let generation = 0;
let testStartedAt = 0;
/** A file can register two drivers, so afterEach may save twice. Keep the first. */
let savedGeneration = -1;

export const redactSecrets = (text: string, env: SecretEnv = process.env): string => {
  const secrets = SECRET_ENV_KEYS.flatMap((key) => {
    const value = env[key];
    return typeof value === 'string' && value.length >= 4 ? [{ key, value }] : [];
  }).sort((left, right) => right.value.length - left.value.length);
  let redacted = text;
  for (const secret of secrets) {
    if (!redacted.includes(secret.value)) {
      continue;
    }
    redacted = redacted.split(secret.value).join(`[redacted:${secret.key}]`);
  }
  return redacted.replace(
    /"(tokenHash|token_hash)"\s*:\s*"[^"]*"/g,
    '"$1":"[redacted:tokenHash]"'
  );
};

export const noteTestStart = (): void => {
  generation += 1;
  testStartedAt = Date.now();
  actors.length = 0;
  savedGeneration = -1;
};

export const noteActor = (email: string): void => {
  actors.push(redactSecrets(email));
};

export const sliceServerLog = (text: string, fromMs: number, toMs: number): string => {
  const kept: string[] = [];
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.length === 0) {
      continue;
    }
    const time = timeOf(trimmed);
    if (time === undefined || time < fromMs || time > toMs) {
      continue;
    }
    kept.push(trimmed);
  }
  return kept.join('\n');
};

const timeOf = (line: string): number | undefined => {
  try {
    const parsed: unknown = JSON.parse(line);
    if (typeof parsed !== 'object' || parsed === null || !('time' in parsed)) {
      return undefined;
    }
    const time = parsed.time;
    return typeof time === 'number' && Number.isFinite(time) ? time : undefined;
  } catch {
    return undefined;
  }
};

const slug = (name: string): string => {
  const clean = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return `${Date.now()}-${clean || 'test'}`;
};

/**
 * Context options stay exactly what the caller passed. Video and tracing are
 * not started: recording every context, then finalizing it in `afterAll`,
 * exceeded the 30s hook budget on passing suites.
 */
export const observedContextOptions = <T extends BrowserContextOptions>(options: T): T => options;

const durationOf = (request: Request, item: Observed): number => {
  const started = item.started.get(request);
  item.started.delete(request);
  return started === undefined ? 0 : Date.now() - started;
};

const pushNetwork = (item: Observed, entry: NetworkEntry): void => {
  if (item.network.length >= NETWORK_CAP) {
    return;
  }
  item.network.push({
    ...entry,
    url: redactSecrets(entry.url),
    failure: entry.failure === undefined ? undefined : redactSecrets(entry.failure),
  });
};

const watchPage = (page: Page, item: Observed): void => {
  if (item.watched.has(page)) {
    return;
  }
  item.watched.add(page);
  page.on('console', (message) => {
    if (item.consoleLines.length >= CONSOLE_CAP) {
      return;
    }
    item.consoleLines.push(redactSecrets(`${message.type()}: ${message.text()}`));
  });
  page.on('pageerror', (error) => {
    item.pageErrors.push(redactSecrets(error.message));
  });
  page.on('request', (request) => {
    item.started.set(request, Date.now());
  });
  page.on('requestfailed', (request) => {
    if (item.seen.has(request)) {
      return;
    }
    item.seen.add(request);
    const durationMs = durationOf(request, item);
    pushNetwork(item, {
      method: request.method(),
      url: request.url(),
      durationMs,
      failure: request.failure()?.errorText,
      slow: durationMs >= SLOW_NETWORK_MS,
    });
  });
  page.on('response', (response) => {
    if (response.status() < 400) {
      return;
    }
    const request = response.request();
    if (item.seen.has(request)) {
      return;
    }
    item.seen.add(request);
    const durationMs = durationOf(request, item);
    pushNetwork(item, {
      method: request.method(),
      url: request.url(),
      durationMs,
      status: response.status(),
      failure: `HTTP ${response.status()}`,
      slow: durationMs >= SLOW_NETWORK_MS,
    });
  });
  page.on('requestfinished', (request) => {
    const durationMs = durationOf(request, item);
    if (durationMs < SLOW_NETWORK_MS || item.seen.has(request)) {
      return;
    }
    item.seen.add(request);
    item.pending.push(
      request
        .response()
        .then((response) => {
          pushNetwork(item, {
            method: request.method(),
            url: request.url(),
            durationMs,
            status: response?.status(),
            slow: true,
          });
        })
        .catch(() => undefined)
    );
  });
};

export const attachObservedContext = (context: BrowserContext): void => {
  if (!diagnosticsEnabled()) {
    return;
  }
  const item: Observed = {
    context,
    generation,
    consoleLines: [],
    pageErrors: [],
    network: [],
    pending: [],
    started: new Map(),
    seen: new WeakSet(),
    watched: new WeakSet(),
    discarded: false,
  };
  context.on('page', (page) => {
    watchPage(page, item);
  });
  for (const page of context.pages()) {
    watchPage(page, item);
  }
  observed.push(item);
};

const readApiLogWindow = async (fromMs: number, toMs: number): Promise<string> => {
  const logPath = process.env.YOINK_API_LOG;
  if (!logPath) {
    return '';
  }
  try {
    const text = await readFile(logPath, 'utf8');
    return redactSecrets(sliceServerLog(text, fromMs - LOG_WINDOW_PAD_MS, toMs + LOG_WINDOW_PAD_MS));
  } catch {
    return '';
  }
};

const relevantContexts = (): Observed[] =>
  observed.filter((item) => !item.discarded && item.generation === generation);

const clearPasswordFields = async (page: Page): Promise<void> => {
  await page.evaluate(`(() => {
    for (const input of document.querySelectorAll('input[type="password"]')) {
      input.value = '';
    }
  })()`);
};

export const saveFailureDiagnostics = async (testName: string): Promise<void> => {
  if (!diagnosticsEnabled()) {
    return;
  }
  if (savedGeneration === generation) {
    return;
  }
  savedGeneration = generation;
  try {
    const finishedAt = Date.now();
    const fromMs = testStartedAt > 0 ? testStartedAt : finishedAt - 60_000;
    const contexts = relevantContexts();
    const safeName = redactSecrets(testName).replace(/\[redacted:[^\]]+\]/g, 'redacted');
    const dir = join(diagnosticsRoot(), slug(safeName));
    await mkdir(dir, { recursive: true });
    const screenshots: string[] = [];
    for (const [index, item] of contexts.entries()) {
      await Promise.all(item.pending);
      for (const [pageIndex, page] of item.context.pages().entries()) {
        if (page.isClosed()) {
          continue;
        }
        const name = `screenshot-${index}-${pageIndex}.png`;
        try {
          await clearPasswordFields(page);
        } catch {
          // A closing page may refuse the evaluate.
        }
        try {
          await page.screenshot({ path: join(dir, name) });
          screenshots.push(name);
        } catch {
          // The page may already be closing.
        }
      }
      item.discarded = true;
    }
    const apiLog = await readApiLogWindow(fromMs, finishedAt);
    const report = {
      test: redactSecrets(testName),
      startedAt: new Date(fromMs).toISOString(),
      finishedAt: new Date(finishedAt).toISOString(),
      actors: actors.map((email) => redactSecrets(email)),
      console: contexts.flatMap((item) => item.consoleLines.map((line) => redactSecrets(line))),
      pageErrors: contexts.flatMap((item) => item.pageErrors.map((line) => redactSecrets(line))),
      network: contexts.flatMap((item) => item.network),
      screenshots,
      apiLog: 'api-log-window.log',
      apiLogStatus: apiLog.length > 0
        ? 'window'
        : process.env.YOINK_API_LOG
          ? 'no lines in window'
          : 'YOINK_API_LOG unset',
    };
    await writeFile(join(dir, 'report.json'), `${redactSecrets(JSON.stringify(report, null, 2))}\n`);
    await writeFile(join(dir, 'api-log-window.log'), apiLog.length > 0 ? `${apiLog}\n` : '');
  } catch (error) {
    console.error('failure diagnostics failed', error);
  }
};

/** Drops in-memory buffers for a passing test. No trace, video, or file I/O. */
export const discardPassingDiagnostics = async (): Promise<void> => {
  for (const item of observed) {
    if (item.discarded || item.generation !== generation) {
      continue;
    }
    item.consoleLines.length = 0;
    item.pageErrors.length = 0;
    item.network.length = 0;
    item.pending.length = 0;
    item.started.clear();
    item.discarded = true;
  }
};

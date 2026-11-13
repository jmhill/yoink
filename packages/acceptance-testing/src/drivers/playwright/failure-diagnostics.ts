import { copyFile, mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { BrowserContext, BrowserContextOptions, Page, Request } from '@playwright/test';

export const SLOW_NETWORK_MS = 1000;
export const LOG_WINDOW_PAD_MS = 2000;
const CONSOLE_CAP = 200;
const NETWORK_CAP = 100;

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
  pages: Page[];
  consoleLines: string[];
  pageErrors: string[];
  network: NetworkEntry[];
  pending: Promise<unknown>[];
  started: Map<Request, number>;
  seen: WeakSet<Request>;
  tracingOpen: boolean;
  reportDir?: string;
  discardVideo: boolean;
};

export const diagnosticsEnabled = (): boolean => process.env.YOINK_E2E_DIAGNOSTICS !== '0';

const diagnosticsRoot = (): string => join(process.cwd(), 'e2e-failure-diagnostics');

const observed: Observed[] = [];
const actors: string[] = [];
let generation = 0;
let testStartedAt = 0;

export const noteTestStart = (): void => {
  generation += 1;
  testStartedAt = Date.now();
  actors.length = 0;
};

export const noteActor = (email: string): void => {
  actors.push(email);
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

export const observedContextOptions = async <T extends BrowserContextOptions>(
  options: T
): Promise<T> => {
  if (!diagnosticsEnabled()) {
    return options;
  }
  const dir = join(diagnosticsRoot(), '_video');
  await mkdir(dir, { recursive: true });
  return { ...options, recordVideo: { dir } };
};

const durationOf = (request: Request, item: Observed): number => {
  const started = item.started.get(request);
  return started === undefined ? 0 : Date.now() - started;
};

const pushNetwork = (item: Observed, entry: NetworkEntry): void => {
  if (item.network.length >= NETWORK_CAP) {
    return;
  }
  item.network.push(entry);
};

const watchPage = (page: Page, item: Observed): void => {
  if (item.pages.includes(page)) {
    return;
  }
  item.pages.push(page);
  page.on('console', (message) => {
    if (item.consoleLines.length >= CONSOLE_CAP) {
      return;
    }
    item.consoleLines.push(`${message.type()}: ${message.text()}`);
  });
  page.on('pageerror', (error) => {
    item.pageErrors.push(error.message);
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
      request.response().then((response) => {
        pushNetwork(item, {
          method: request.method(),
          url: request.url(),
          durationMs,
          status: response?.status(),
          slow: true,
        });
      })
    );
  });
};

export const attachObservedContext = async (context: BrowserContext): Promise<void> => {
  if (!diagnosticsEnabled()) {
    return;
  }
  const item: Observed = {
    context,
    generation,
    pages: [],
    consoleLines: [],
    pageErrors: [],
    network: [],
    pending: [],
    started: new Map(),
    seen: new WeakSet(),
    tracingOpen: false,
    discardVideo: false,
  };
  context.on('page', (page) => {
    watchPage(page, item);
  });
  for (const page of context.pages()) {
    watchPage(page, item);
  }
  try {
    // Snapshots serialize the DOM on every action. On a two-core CI runner that
    // pushed a passing 19s test past its 30s limit. Action screenshots, the
    // failure screenshot, and video still show what the page did.
    await context.tracing.start({ screenshots: true, snapshots: false, sources: false });
    item.tracingOpen = true;
  } catch (error) {
    console.error('failure diagnostics: tracing did not start', error);
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
    return sliceServerLog(text, fromMs - LOG_WINDOW_PAD_MS, toMs + LOG_WINDOW_PAD_MS);
  } catch {
    return '';
  }
};

const relevantContexts = (): Observed[] =>
  observed.filter(
    (item) =>
      item.reportDir === undefined &&
      !item.discardVideo &&
      (item.generation === generation || item.generation === 0)
  );

export const saveFailureDiagnostics = async (testName: string): Promise<void> => {
  if (!diagnosticsEnabled()) {
    return;
  }
  try {
    const finishedAt = Date.now();
    const fromMs = testStartedAt > 0 ? testStartedAt : finishedAt - 60_000;
    const contexts = relevantContexts();
    const dir = join(diagnosticsRoot(), slug(testName));
    await mkdir(dir, { recursive: true });
    const screenshots: string[] = [];
    const traces: string[] = [];
    for (const [index, item] of contexts.entries()) {
      await Promise.all(item.pending);
      for (const [pageIndex, page] of item.context.pages().entries()) {
        if (page.isClosed()) {
          continue;
        }
        const name = `screenshot-${index}-${pageIndex}.png`;
        try {
          await page.screenshot({ path: join(dir, name) });
          screenshots.push(name);
        } catch {
          // The page may already be closing.
        }
      }
      if (item.tracingOpen) {
        const name = `trace-${index}.zip`;
        try {
          await item.context.tracing.stop({ path: join(dir, name) });
          traces.push(name);
        } catch {
          // Tracing may already be stopped.
        }
        item.tracingOpen = false;
      }
      item.reportDir = dir;
    }
    const apiLog = await readApiLogWindow(fromMs, finishedAt);
    const report = {
      test: testName,
      startedAt: new Date(fromMs).toISOString(),
      finishedAt: new Date(finishedAt).toISOString(),
      actors: [...actors],
      console: contexts.flatMap((item) => item.consoleLines),
      pageErrors: contexts.flatMap((item) => item.pageErrors),
      network: contexts.flatMap((item) => item.network),
      screenshots,
      traces,
      apiLog: 'api-log-window.log',
      apiLogStatus: apiLog.length > 0
        ? 'window'
        : process.env.YOINK_API_LOG
          ? 'no lines in window'
          : 'YOINK_API_LOG unset',
    };
    await writeFile(join(dir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
    await writeFile(join(dir, 'api-log-window.log'), apiLog.length > 0 ? `${apiLog}\n` : '');
  } catch (error) {
    console.error('failure diagnostics failed', error);
  }
};

export const discardPassingDiagnostics = async (): Promise<void> => {
  if (!diagnosticsEnabled()) {
    return;
  }
  for (const item of observed) {
    if (item.reportDir !== undefined || item.discardVideo || item.generation !== generation) {
      continue;
    }
    if (item.tracingOpen) {
      try {
        await item.context.tracing.stop();
      } catch {
        // Tracing may already be stopped.
      }
      item.tracingOpen = false;
    }
    item.discardVideo = true;
  }
};

export const stopLeftoverTraces = async (): Promise<void> => {
  for (const item of observed) {
    if (!item.tracingOpen) {
      continue;
    }
    try {
      await item.context.tracing.stop();
    } catch {
      // The context may already be closed.
    }
    item.tracingOpen = false;
    if (item.reportDir === undefined) {
      item.discardVideo = true;
    }
  }
};

export const settleDiagnosticVideos = async (): Promise<void> => {
  for (const item of observed) {
    const videos: string[] = [];
    for (const page of item.pages) {
      const video = page.video();
      if (!video) {
        continue;
      }
      try {
        videos.push(await video.path());
      } catch {
        // This page never recorded video.
      }
    }
    if (item.reportDir !== undefined) {
      for (const [index, from] of videos.entries()) {
        try {
          await copyFile(from, join(item.reportDir, `video-${index}.webm`));
          await unlink(from);
        } catch {
          // The original stays under _video and is still uploaded.
        }
      }
      continue;
    }
    if (item.discardVideo) {
      for (const from of videos) {
        await unlink(from).catch(() => undefined);
      }
    }
  }
  observed.length = 0;
};

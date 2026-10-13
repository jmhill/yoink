import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const apiRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

const startScriptArgv = (start: string): string[] => start.trim().split(/\s+/);

const dockerfileCmdArgv = (dockerfile: string): string[] => {
  const cmdLine = dockerfile
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.startsWith('CMD '));

  if (cmdLine === undefined) {
    throw new Error('Dockerfile must declare a CMD');
  }

  const parsed: unknown = JSON.parse(cmdLine.slice('CMD '.length));
  if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== 'string')) {
    throw new Error('Dockerfile CMD must be a JSON string array');
  }
  return parsed;
};

const startScriptFromPackageJson = (raw: string): string => {
  const parsed: unknown = JSON.parse(raw);
  if (typeof parsed !== 'object' || parsed === null || !('scripts' in parsed)) {
    throw new Error('package.json must have scripts');
  }
  const scripts: unknown = parsed.scripts;
  if (
    typeof scripts !== 'object' ||
    scripts === null ||
    !('start' in scripts) ||
    typeof scripts.start !== 'string'
  ) {
    throw new Error('package.json must have a start script string');
  }
  return scripts.start;
};

describe('container command', () => {
  it('matches the start script so the production container loads Sentry', () => {
    const start = startScriptArgv(
      startScriptFromPackageJson(readFileSync(join(apiRoot, 'package.json'), 'utf8'))
    );
    const cmd = dockerfileCmdArgv(readFileSync(join(apiRoot, 'Dockerfile'), 'utf8'));

    expect(cmd).toEqual(start);
    expect(cmd).toContain('--import');
    expect(cmd).toContain('./dist/instrument.js');
    expect(cmd).toContain('--experimental-sqlite');
  });
});

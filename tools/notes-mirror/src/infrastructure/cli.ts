#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { runMirror } from '../application/run-mirror.js';
import { createStateStore } from './state-file.js';
import { createVaultStore } from './vault-fs.js';
import { createYoinkApi } from './yoink-api.js';

const readToken = async (): Promise<string> => {
  const direct = process.env.YOINK_NOTES_TOKEN;
  if (direct && direct.length > 0) {
    return direct;
  }
  const filePath = process.env.YOINK_NOTES_TOKEN_FILE;
  if (!filePath) {
    return '';
  }
  return (await readFile(filePath, 'utf8')).trim();
};

const main = async (): Promise<number> => {
  const parsed = parseArgs({
    options: {
      vault: { type: 'string' },
      api: { type: 'string' },
      state: { type: 'string' },
    },
  });
  const vault = parsed.values.vault;
  const api = parsed.values.api;
  const state = parsed.values.state;
  if (!vault || !api || !state) {
    process.stderr.write(
      'Usage: yoink-notes-mirror --vault <path> --api <url> --state <path>\nToken: YOINK_NOTES_TOKEN or YOINK_NOTES_TOKEN_FILE\n'
    );
    return 2;
  }
  const token = await readToken();
  if (token.length === 0) {
    process.stderr.write("Set YOINK_NOTES_TOKEN or YOINK_NOTES_TOKEN_FILE to Libby's bot token.\n");
    return 2;
  }

  const result = await runMirror({
    api: createYoinkApi({ baseUrl: api, token }),
    vault: createVaultStore(vault),
    state: createStateStore(state),
  });
  if (result.isErr()) {
    process.stderr.write(`${result.error}\n`);
    return 1;
  }
  for (const warning of result.value.warnings) {
    process.stderr.write(`${warning}\n`);
  }
  process.stdout.write(`Applied ${result.value.actions.length} mirror action(s).\n`);
  return 0;
};

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((cause: unknown) => {
    process.stderr.write(`${cause instanceof Error ? cause.message : 'Mirror failed'}\n`);
    process.exitCode = 1;
  });

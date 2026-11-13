import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { redactSecrets, sliceServerLog } from './failure-diagnostics.js';

describe('API log window', () => {
  const roots: string[] = [];

  afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
  });

  it('keeps JSON lines whose time falls in the test window', () => {
    const log = [
      JSON.stringify({ time: 1_000, msg: 'before', reqId: 'a' }),
      JSON.stringify({
        time: 5_000,
        msg: 'request completed',
        reqId: 'req-1',
        method: 'GET',
        route: '/api/tasks',
        statusCode: 200,
        responseTime: 12,
      }),
      JSON.stringify({ time: 9_000, msg: 'after', reqId: 'c' }),
      'not json',
    ].join('\n');

    const window = sliceServerLog(log, 4_000, 6_000);
    expect(window).toContain('"reqId":"req-1"');
    expect(window).toContain('"responseTime":12');
    expect(window).not.toContain('before');
    expect(window).not.toContain('after');
    expect(window).not.toContain('not json');
  });

  it('reads back a written window', async () => {
    const root = await mkdtemp(join(tmpdir(), 'yoink-diag-'));
    roots.push(root);
    const line = JSON.stringify({ time: 50, msg: 'write_gate_wait', gate: 'write', waitedMs: 80 });
    await writeFile(join(root, 'api.log'), `${line}\n`);
    const text = await readFile(join(root, 'api.log'), 'utf8');
    expect(sliceServerLog(text, 0, 100)).toContain('write_gate_wait');
  });

  it('redacts admin, session, and WebAuthn secrets', () => {
    const env = {
      TEST_ADMIN_PASSWORD: 'test-admin-password',
      ADMIN_PASSWORD: 'test-admin-password',
      SESSION_SECRET: 'session-secret-value',
      WEBAUTHN_CHALLENGE_SECRET: 'webauthn-challenge-value',
    };
    const raw = [
      'filled test-admin-password',
      'session-secret-value',
      'webauthn-challenge-value',
      'tokenHash stays out of this helper',
    ].join('\n');
    const redacted = redactSecrets(raw, env);
    expect(redacted).not.toContain('test-admin-password');
    expect(redacted).not.toContain('session-secret-value');
    expect(redacted).not.toContain('webauthn-challenge-value');
    expect(redacted).toMatch(/\[redacted:(TEST_)?ADMIN_PASSWORD\]/);
    expect(redacted).toContain('tokenHash stays out of this helper');
  });

  it('redacts a tokenHash field without keeping the hash', () => {
    const raw = '{"tokenHash":"fake-hash:valid-token","token_hash":"abc123","name":"agent"}';
    const redacted = redactSecrets(raw, {});
    expect(redacted).not.toContain('fake-hash:valid-token');
    expect(redacted).not.toContain('abc123');
    expect(redacted).toContain('[redacted:tokenHash]');
    expect(redacted).toContain('"name":"agent"');
  });
});

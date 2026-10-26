import { describe, expect, it } from 'vitest';
import { runTursoCall } from './run-turso-call.js';

const connectionError = () => Object.assign(new Error('fetch failed'), { code: 'ECONNRESET' });
const queryError = () => Object.assign(new Error('no such table'), { code: 'SQLITE_ERROR' });

describe('runTursoCall', () => {
  it('retries a slow call once and keeps the second result', async () => {
    const calls: number[] = [];
    const operation = () => {
      const attempt = calls.length + 1;
      calls.push(attempt);
      if (attempt === 1) {
        return new Promise<string>(() => undefined);
      }
      return Promise.resolve('row');
    };

    const result = await runTursoCall(operation, { timeoutMs: 20 });

    expect(calls).toEqual([1, 2]);
    expect(result.isOk() && result.value).toBe('row');
  });

  it('retries a connection failure once and then returns that failure', async () => {
    const calls: number[] = [];
    const failure = connectionError();
    const operation = () => {
      calls.push(calls.length + 1);
      return Promise.reject(failure);
    };

    const result = await runTursoCall(operation, { timeoutMs: 20 });

    expect(calls).toEqual([1, 2]);
    expect(result.isErr() && result.error).toBe(failure);
  });

  it('does not retry a SQL error', async () => {
    const calls: number[] = [];
    const failure = queryError();
    const operation = () => {
      calls.push(calls.length + 1);
      return Promise.reject(failure);
    };

    const result = await runTursoCall(operation, { timeoutMs: 20 });

    expect(calls).toHaveLength(1);
    expect(result.isErr() && result.error).toBe(failure);
  });

  it('returns a fast success without a second call', async () => {
    const calls: number[] = [];
    const result = await runTursoCall(
      () => {
        calls.push(1);
        return Promise.resolve('ok');
      },
      { timeoutMs: 50 }
    );

    expect(calls).toEqual([1]);
    expect(result.isOk() && result.value).toBe('ok');
  });
});

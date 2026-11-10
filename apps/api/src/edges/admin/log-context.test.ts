import { describe, expect, it } from 'vitest';
import { adminRequestLog } from './log-context.js';

describe('admin request log', () => {
  it('records the build id and does not record the session cookie', async () => {
    const lines: unknown[] = [];
    const request = {
      headers: {
        'x-yoink-build': 'abc123',
        cookie: 'admin_session=secret-cookie',
      },
      log: {
        info: (fields: unknown) => {
          lines.push(fields);
        },
      },
    };
    await adminRequestLog(request as never);
    expect(lines).toEqual([{ edge: 'admin', buildId: 'abc123' }]);
    expect(JSON.stringify(lines)).not.toContain('secret-cookie');
  });

  it('records absent when the header is missing', async () => {
    const lines: unknown[] = [];
    await adminRequestLog({
      headers: {},
      log: { info: (fields: unknown) => lines.push(fields) },
    } as never);
    expect(lines).toEqual([{ edge: 'admin', buildId: 'absent' }]);
  });
});

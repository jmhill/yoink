import { describe, expect, it } from 'vitest';
import { writeGateWaitWarning } from './database.js';

describe('write gate wait', () => {
  it('warns when a fixture server waits on the write gate', () => {
    expect(writeGateWaitWarning({ YOINK_TEST_FIXTURES: 'true' }, 'write', 80)).toEqual({
      msg: 'write_gate_wait',
      gate: 'write',
      waitedMs: 80,
    });
    expect(writeGateWaitWarning({ YOINK_TEST_FIXTURES: 'true' }, 'read', 5000)).toBeUndefined();
    expect(writeGateWaitWarning({ YOINK_TEST_FIXTURES: 'true' }, 'write', 10)).toBeUndefined();
    expect(
      writeGateWaitWarning({ YOINK_TEST_FIXTURES: 'true', VITEST: 'true' }, 'write', 5000)
    ).toBeUndefined();
  });
});

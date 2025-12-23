import { describe, it, expect, vi, beforeEach } from 'vitest';
import MultiDriverReporter from './reporter.js';

// Mock writeFileSync to prevent actual file writes during tests
vi.mock('node:fs', () => ({
  writeFileSync: vi.fn(),
}));

type MockTestTask = {
  type: 'test';
  name: string;
  id: string;
  mode: 'run';
  result: { state: 'pass' | 'fail' | 'skip' | 'todo' };
};

type MockSuiteTask = {
  type: 'suite';
  name: string;
  id: string;
  mode: 'run';
  tasks: MockTask[];
};

type MockTask = MockTestTask | MockSuiteTask;

/**
 * Create a mock test task.
 * Using partial types since Vitest's Task type is complex and deprecated.
 */
const createTestTask = (
  name: string,
  state: 'pass' | 'fail' | 'skip' | 'todo' = 'pass'
): MockTestTask => ({
  type: 'test',
  name,
  id: `test-${name}`,
  mode: 'run',
  result: { state },
});

/**
 * Create a mock suite task with child tasks.
 */
const createSuiteTask = (name: string, tasks: MockTask[]): MockSuiteTask => ({
  type: 'suite',
  name,
  id: `suite-${name}`,
  mode: 'run',
  tasks,
});

/**
 * Create a mock File for the reporter.
 */
const createMockFile = (tasks: MockTask[]) => ({
  tasks,
  filepath: '/test/file.test.ts',
});

describe('MultiDriverReporter', () => {
  let reporter: MultiDriverReporter;
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    reporter = new MultiDriverReporter();
    reporter.onInit();
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  describe('extracting drivers from suite names', () => {
    it('extracts driver from suite name with [driver] suffix', () => {
      const file = createMockFile([
        createSuiteTask('Capturing notes [http]', [
          createTestTask('can create a capture'),
        ]),
      ]);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      reporter.onFinished([file as any]);

      const output = consoleLogSpy.mock.calls[0]?.[0] as string;
      expect(output).toContain('http');
      expect(output).toContain('can create a capture');
      expect(output).not.toContain('No tests with driver suffixes found');
    });

    it('extracts drivers from multiple suites for same tests', () => {
      const file = createMockFile([
        createSuiteTask('Capturing notes [http]', [
          createTestTask('can create a capture'),
        ]),
        createSuiteTask('Capturing notes [playwright]', [
          createTestTask('can create a capture'),
        ]),
      ]);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      reporter.onFinished([file as any]);

      const output = consoleLogSpy.mock.calls[0]?.[0] as string;
      expect(output).toContain('http');
      expect(output).toContain('playwright');
      // Should have one row for the test with both drivers
      expect(output.match(/can create a capture/g)?.length).toBe(1);
    });

    it('ignores tests without driver suffix in suite path', () => {
      const file = createMockFile([
        createSuiteTask('Some suite without driver', [
          createTestTask('some test'),
        ]),
      ]);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      reporter.onFinished([file as any]);

      const output = consoleLogSpy.mock.calls[0]?.[0] as string;
      expect(output).toContain('No tests with driver suffixes found');
    });
  });

  describe('building clean feature paths', () => {
    it('removes driver suffix from feature path in report', () => {
      const file = createMockFile([
        createSuiteTask('Capturing notes [http]', [
          createTestTask('can create a capture'),
        ]),
      ]);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      reporter.onFinished([file as any]);

      const output = consoleLogSpy.mock.calls[0]?.[0] as string;
      // Should show "Capturing notes" without "[http]"
      expect(output).toContain('Capturing notes > can create a capture');
      expect(output).not.toContain('[http] >');
    });

    it('preserves nested suite structure in feature path', () => {
      const file = createMockFile([
        createSuiteTask('Capturing notes [http]', [
          createSuiteTask('validation', [createTestTask('rejects empty content')]),
        ]),
      ]);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      reporter.onFinished([file as any]);

      const output = consoleLogSpy.mock.calls[0]?.[0] as string;
      expect(output).toContain(
        'Capturing notes > validation > rejects empty content'
      );
    });
  });

  describe('test status mapping', () => {
    it('shows checkmark for passing tests', () => {
      const file = createMockFile([
        createSuiteTask('Feature [http]', [createTestTask('passes', 'pass')]),
      ]);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      reporter.onFinished([file as any]);

      const output = consoleLogSpy.mock.calls[0]?.[0] as string;
      expect(output).toMatch(/passes.*✅/);
    });

    it('shows X for failing tests', () => {
      const file = createMockFile([
        createSuiteTask('Feature [http]', [createTestTask('fails', 'fail')]),
      ]);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      reporter.onFinished([file as any]);

      const output = consoleLogSpy.mock.calls[0]?.[0] as string;
      expect(output).toMatch(/fails.*❌/);
    });

    it('shows skip icon for skipped tests', () => {
      const file = createMockFile([
        createSuiteTask('Feature [http]', [createTestTask('skipped', 'skip')]),
      ]);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      reporter.onFinished([file as any]);

      const output = consoleLogSpy.mock.calls[0]?.[0] as string;
      expect(output).toContain('skipped');
    });

    it('shows N/A for tests not run with a particular driver', () => {
      const file = createMockFile([
        createSuiteTask('Feature [http]', [createTestTask('http only test')]),
        createSuiteTask('Other Feature [playwright]', [
          createTestTask('playwright only test'),
        ]),
      ]);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      reporter.onFinished([file as any]);

      const output = consoleLogSpy.mock.calls[0]?.[0] as string;
      // The http only test should show N/A for playwright column
      expect(output).toContain('N/A');
    });
  });

  describe('summary statistics', () => {
    it('counts passed and total tests correctly', () => {
      const file = createMockFile([
        createSuiteTask('Feature [http]', [
          createTestTask('test1', 'pass'),
          createTestTask('test2', 'pass'),
          createTestTask('test3', 'fail'),
        ]),
      ]);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      reporter.onFinished([file as any]);

      const output = consoleLogSpy.mock.calls[0]?.[0] as string;
      expect(output).toContain('2/3 tests passed');
    });

    it('shows success icon when all tests pass', () => {
      const file = createMockFile([
        createSuiteTask('Feature [http]', [
          createTestTask('test1', 'pass'),
          createTestTask('test2', 'pass'),
        ]),
      ]);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      reporter.onFinished([file as any]);

      const output = consoleLogSpy.mock.calls[0]?.[0] as string;
      expect(output).toContain('### ✅ Total:');
    });

    it('shows failure icon when any test fails', () => {
      const file = createMockFile([
        createSuiteTask('Feature [http]', [
          createTestTask('test1', 'pass'),
          createTestTask('test2', 'fail'),
        ]),
      ]);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      reporter.onFinished([file as any]);

      const output = consoleLogSpy.mock.calls[0]?.[0] as string;
      expect(output).toContain('### ❌ Total:');
    });
  });
});

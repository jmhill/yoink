import { writeFileSync } from 'node:fs';
import type { Reporter, File, Task } from 'vitest';

/**
 * Result for a single test across all drivers.
 */
type TestResultEntry = {
  /** Base test name without driver suffix */
  baseName: string;
  /** Feature/suite name */
  feature: string;
  /** Results per driver: 'pass' | 'fail' | 'skip' | undefined */
  drivers: Record<string, 'pass' | 'fail' | 'skip'>;
};

/**
 * Extract driver name from test name.
 * Test names end with [driverName], e.g., "can create capture [http]"
 */
const extractDriver = (testName: string): { baseName: string; driver: string } | null => {
  const match = testName.match(/^(.+)\s+\[(\w+)\]$/);
  if (!match) return null;
  return { baseName: match[1], driver: match[2] };
};

/**
 * Custom Vitest reporter that outputs a unified markdown table
 * showing test results across all drivers.
 *
 * Output format:
 * ```markdown
 * ## Acceptance Test Results
 *
 * | Test | http | playwright |
 * |------|------|------------|
 * | Capturing notes > can create a capture | ✅ | ✅ |
 * | Organizing work > can archive | ✅ | ✅ |
 * | Managing tenants > can create org | ✅ | N/A |
 *
 * **Total: 42 passed, 0 failed**
 * ```
 */
export default class MultiDriverReporter implements Reporter {
  private results: Map<string, TestResultEntry> = new Map();
  private drivers: Set<string> = new Set();
  private startTime: number = 0;

  onInit(): void {
    this.results.clear();
    this.drivers.clear();
    this.startTime = Date.now();
  }

  /**
   * Recursively collect all test cases from tasks.
   */
  private collectTests(tasks: Task[], featurePath: string[] = []): void {
    for (const task of tasks) {
      if (task.type === 'test') {
        const parsed = extractDriver(task.name);
        if (!parsed) continue;

        const { baseName, driver } = parsed;
        this.drivers.add(driver);

        // Build the full feature path
        const feature = featurePath.join(' > ');
        const fullKey = `${feature} > ${baseName}`;

        let result = this.results.get(fullKey);
        if (!result) {
          result = {
            baseName,
            feature,
            drivers: {},
          };
          this.results.set(fullKey, result);
        }

        // Determine test status
        const state = task.result?.state;
        if (state === 'pass') {
          result.drivers[driver] = 'pass';
        } else if (state === 'fail') {
          result.drivers[driver] = 'fail';
        } else if (state === 'skip' || state === 'todo') {
          result.drivers[driver] = 'skip';
        }
      } else if (task.type === 'suite' && 'tasks' in task && task.tasks) {
        // Build feature path from suite names, skip driver-specific suites
        let childFeaturePath = [...featurePath];
        if (!task.name.match(/^\[\w+\]$/)) {
          childFeaturePath = [...featurePath, task.name];
        }
        this.collectTests(task.tasks, childFeaturePath);
      }
    }
  }

  /**
   * Called when all tests have finished.
   */
  onFinished(files: File[] = []): void {
    // Collect all test results
    for (const file of files) {
      this.collectTests(file.tasks);
    }

    // Generate report
    const report = this.generateReport();

    // Write to file
    const outputPath = 'test-report.md';
    writeFileSync(outputPath, report);

    // Also output to console
    console.log('\n' + report);
  }

  private generateReport(): string {
    const driverList = Array.from(this.drivers).sort();
    const lines: string[] = [];

    lines.push('## Acceptance Test Results');
    lines.push('');

    if (driverList.length === 0) {
      lines.push('_No tests with driver suffixes found._');
      lines.push('');
      return lines.join('\n');
    }

    // Header row
    const header = `| Test | ${driverList.join(' | ')} |`;
    lines.push(header);

    // Separator row
    const separator = `|------|${driverList.map(() => '------').join('|')}|`;
    lines.push(separator);

    // Sort results by feature then test name
    const sortedResults = Array.from(this.results.values()).sort((a, b) => {
      const featureCmp = a.feature.localeCompare(b.feature);
      if (featureCmp !== 0) return featureCmp;
      return a.baseName.localeCompare(b.baseName);
    });

    // Count totals
    let passed = 0;
    let failed = 0;
    let skipped = 0;

    // Data rows
    for (const result of sortedResults) {
      const testName = `${result.feature} > ${result.baseName}`;
      const driverCells = driverList.map((driver) => {
        const status = result.drivers[driver];
        if (status === 'pass') {
          passed++;
          return '✅';
        } else if (status === 'fail') {
          failed++;
          return '❌';
        } else if (status === 'skip') {
          skipped++;
          return '⏭️';
        } else {
          return 'N/A';
        }
      });

      lines.push(`| ${testName} | ${driverCells.join(' | ')} |`);
    }

    lines.push('');

    // Summary
    const duration = ((Date.now() - this.startTime) / 1000).toFixed(2);
    const total = passed + failed;
    const icon = failed === 0 ? '✅' : '❌';

    lines.push(`### ${icon} Total: ${passed}/${total} tests passed`);
    if (skipped > 0) {
      lines.push(`_${skipped} tests skipped_`);
    }
    lines.push(`_Duration: ${duration}s_`);
    lines.push('');

    return lines.join('\n');
  }
}

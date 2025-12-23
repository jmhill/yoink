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
 * Extract driver name from a suite or test name.
 * Names containing [driverName], e.g., "Capturing notes [http]"
 * Returns the name without the driver suffix and the driver name.
 */
const extractDriver = (name: string): { baseName: string; driver: string } | null => {
  const match = name.match(/^(.+)\s+\[(\w+)\]$/);
  if (!match) return null;
  return { baseName: match[1].trim(), driver: match[2] };
};

/**
 * Find the driver name from the feature path by looking for [driverName] suffix
 * in any of the path segments.
 */
const findDriverInPath = (featurePath: string[]): string | null => {
  for (const segment of featurePath) {
    const parsed = extractDriver(segment);
    if (parsed) return parsed.driver;
  }
  return null;
};

/**
 * Build feature path without driver suffixes.
 */
const buildCleanFeaturePath = (featurePath: string[]): string => {
  return featurePath
    .map((segment) => {
      const parsed = extractDriver(segment);
      return parsed ? parsed.baseName : segment;
    })
    .join(' > ');
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
   * The driver name is extracted from suite names that contain [driverName] suffix.
   */
  private collectTests(tasks: Task[], featurePath: string[] = []): void {
    for (const task of tasks) {
      if (task.type === 'test') {
        // Find the driver from the suite path (e.g., "Capturing notes [http]")
        const driver = findDriverInPath(featurePath);
        if (!driver) continue;

        this.drivers.add(driver);

        // Build the feature path without driver suffixes
        const feature = buildCleanFeaturePath(featurePath);
        const testName = task.name;
        const fullKey = `${feature} > ${testName}`;

        let result = this.results.get(fullKey);
        if (!result) {
          result = {
            baseName: testName,
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
        // Add suite name to feature path (including driver suffix if present)
        const childFeaturePath = [...featurePath, task.name];
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

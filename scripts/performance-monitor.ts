#!/usr/bin/env bun
/**
 * Performance monitoring and regression detection for claude-lsp-cli
 * 
 * This script runs performance tests and compares results against baselines
 * to detect performance regressions in CI/CD pipelines.
 * 
 * Usage:
 *   bun run scripts/performance-monitor.ts --baseline    # Create baseline
 *   bun run scripts/performance-monitor.ts --check      # Check against baseline
 *   bun run scripts/performance-monitor.ts --report     # Generate report
 */

import { performance } from 'perf_hooks';
import { writeFileSync, readFileSync, existsSync } from 'fs';
import { checkFile } from '../src/file-checker';
import { join } from 'path';

interface BaselineMetrics {
  timestamp: string;
  commit?: string;
  branch?: string;
  environment: {
    platform: string;
    nodeVersion: string;
    bunVersion: string;
  };
  metrics: {
    [testName: string]: {
      avgExecutionMs: number;
      maxExecutionMs: number;
      avgMemoryMB: number;
      maxMemoryMB: number;
      diagnosticCount: number;
      sampleSize: number;
    };
  };
}

interface TestResult {
  testName: string;
  executionMs: number;
  memoryMB: number;
  diagnosticCount: number;
}

interface RegressionResult {
  testName: string;
  current: TestResult;
  baseline: BaselineMetrics['metrics'][string];
  regression: {
    executionTimeIncrease: number; // percentage
    memoryIncrease: number; // percentage
    isRegression: boolean;
  };
}

class PerformanceMonitor {
  private readonly BASELINE_FILE = 'performance-baseline.json';
  private readonly REGRESSION_THRESHOLD = 25; // 25% performance degradation threshold
  private readonly MEMORY_THRESHOLD = 50; // 50% memory increase threshold
  private readonly SAMPLE_SIZE = 3; // Number of runs to average

  private async runPerformanceTest(testName: string, testFile: string): Promise<TestResult[]> {
    const results: TestResult[] = [];

    for (let i = 0; i < this.SAMPLE_SIZE; i++) {
      if (global.gc) {
        global.gc(); // Force garbage collection before each run
      }

      const memBefore = process.memoryUsage();
      const startTime = performance.now();
      
      const result = await checkFile(testFile);
      
      const endTime = performance.now();
      const memAfter = process.memoryUsage();

      results.push({
        testName,
        executionMs: endTime - startTime,
        memoryMB: (memAfter.heapUsed - memBefore.heapUsed) / 1024 / 1024,
        diagnosticCount: (result && result.diagnostics) ? result.diagnostics.length : 0,
      });

      // Small delay between runs to allow system to stabilize
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    return results;
  }

  private async createTestFiles(): Promise<{ [testName: string]: string }> {
    const testFiles: { [testName: string]: string } = {};

    // TypeScript test file
    const tsFile = '/tmp/perf-test.ts';
    writeFileSync(tsFile, `
interface Config {
  apiUrl: string;
  timeout: number;
  retries: number;
}

class ApiClient {
  private config: Config;
  private cache = new Map<string, any>();

  constructor(config: Config) {
    this.config = config;
  }

  async get<T>(endpoint: string): Promise<T> {
    const cacheKey = \`GET:\${endpoint}\`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    const response = await this.fetchWithRetry(endpoint, 'GET');
    this.cache.set(cacheKey, response);
    return response;
  }

  private async fetchWithRetry(endpoint: string, method: string): Promise<any> {
    for (let attempt = 0; attempt < this.config.retries; attempt++) {
      try {
        const response = await fetch(\`\${this.config.apiUrl}\${endpoint}\`, {
          method,
          timeout: this.config.timeout,
        });
        return await response.json();
      } catch (error) {
        if (attempt === this.config.retries - 1) {
          throw error;
        }
        await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
      }
    }
  }
}

// Intentional type errors for consistent diagnostic count
const invalidConfig: Config = {
  apiUrl: 123, // Type error
  timeout: "5000", // Type error
  retries: true // Type error
};

const client = new ApiClient(invalidConfig);
console.log(undefinedVariable); // Undefined variable error
`);
    testFiles['typescript'] = tsFile;

    // Python test file
    const pyFile = '/tmp/perf-test.py';
    writeFileSync(pyFile, `
from typing import Dict, Optional, Any, List
import json
import time
from dataclasses import dataclass

@dataclass
class Config:
    api_url: str
    timeout: int
    retries: int

class ApiClient:
    def __init__(self, config: Config):
        self.config = config
        self.cache: Dict[str, Any] = {}
    
    async def get(self, endpoint: str) -> Optional[Dict[str, Any]]:
        cache_key = f"GET:{endpoint}"
        if cache_key in self.cache:
            return self.cache[cache_key]
        
        response = await self._fetch_with_retry(endpoint, "GET")
        self.cache[cache_key] = response
        return response
    
    async def _fetch_with_retry(self, endpoint: str, method: str) -> Dict[str, Any]:
        for attempt in range(self.config.retries):
            try:
                # Simulated API call
                url = f"{self.config.api_url}{endpoint}"
                response = self._simulate_request(url, method)
                return json.loads(response) if response else {}
            except Exception as error:
                if attempt == self.config.retries - 1:
                    raise error
                time.sleep(1 * (attempt + 1))
        return {}
    
    def _simulate_request(self, url: str, method: str) -> str:
        return '{"status": "ok", "data": []}'

# Intentional type errors for consistent diagnostic count
invalid_config: Config = Config(
    api_url=123,  # Type error
    timeout="5000",  # Type error
    retries=True  # Type error
)

client = ApiClient(invalid_config)
print(undefined_variable)  # Undefined variable error
`);
    testFiles['python'] = pyFile;

    return testFiles;
  }

  async createBaseline(): Promise<BaselineMetrics> {
    console.log('Creating performance baseline...');
    
    const testFiles = await this.createTestFiles();
    const metrics: BaselineMetrics['metrics'] = {};

    for (const [testName, testFile] of Object.entries(testFiles)) {
      console.log(`  Running ${testName} baseline tests...`);
      
      const results = await this.runPerformanceTest(testName, testFile);
      
      const executionTimes = results.map(r => r.executionMs);
      const memoryUsages = results.map(r => r.memoryMB);
      const diagnosticCount = results[0].diagnosticCount; // Should be consistent

      metrics[testName] = {
        avgExecutionMs: executionTimes.reduce((sum, t) => sum + t, 0) / executionTimes.length,
        maxExecutionMs: Math.max(...executionTimes),
        avgMemoryMB: memoryUsages.reduce((sum, m) => sum + m, 0) / memoryUsages.length,
        maxMemoryMB: Math.max(...memoryUsages),
        diagnosticCount,
        sampleSize: results.length,
      };

      console.log(`    ${testName}: ${metrics[testName].avgExecutionMs.toFixed(2)}ms avg, ${metrics[testName].avgMemoryMB.toFixed(2)}MB avg`);
    }

    const baseline: BaselineMetrics = {
      timestamp: new Date().toISOString(),
      commit: process.env.GITHUB_SHA || process.env.CI_COMMIT_SHA,
      branch: process.env.GITHUB_REF_NAME || process.env.CI_COMMIT_REF_NAME,
      environment: {
        platform: process.platform,
        nodeVersion: process.version,
        bunVersion: Bun.version,
      },
      metrics,
    };

    writeFileSync(this.BASELINE_FILE, JSON.stringify(baseline, null, 2));
    console.log(`Baseline created: ${this.BASELINE_FILE}`);
    
    return baseline;
  }

  async checkRegression(): Promise<RegressionResult[]> {
    if (!existsSync(this.BASELINE_FILE)) {
      throw new Error(`Baseline file not found: ${this.BASELINE_FILE}. Run with --baseline first.`);
    }

    console.log('Checking for performance regressions...');
    
    const baseline: BaselineMetrics = JSON.parse(readFileSync(this.BASELINE_FILE, 'utf-8'));
    const testFiles = await this.createTestFiles();
    const regressions: RegressionResult[] = [];

    for (const [testName, testFile] of Object.entries(testFiles)) {
      if (!baseline.metrics[testName]) {
        console.warn(`  Warning: No baseline data for ${testName}, skipping`);
        continue;
      }

      console.log(`  Testing ${testName} for regressions...`);
      
      const results = await this.runPerformanceTest(testName, testFile);
      const avgResult = {
        testName,
        executionMs: results.reduce((sum, r) => sum + r.executionMs, 0) / results.length,
        memoryMB: results.reduce((sum, r) => sum + r.memoryMB, 0) / results.length,
        diagnosticCount: results[0].diagnosticCount,
      };

      const baselineMetrics = baseline.metrics[testName];
      const executionIncrease = ((avgResult.executionMs - baselineMetrics.avgExecutionMs) / baselineMetrics.avgExecutionMs) * 100;
      const memoryIncrease = ((avgResult.memoryMB - baselineMetrics.avgMemoryMB) / baselineMetrics.avgMemoryMB) * 100;
      
      const isRegression = executionIncrease > this.REGRESSION_THRESHOLD || memoryIncrease > this.MEMORY_THRESHOLD;

      regressions.push({
        testName,
        current: avgResult,
        baseline: baselineMetrics,
        regression: {
          executionTimeIncrease: executionIncrease,
          memoryIncrease: memoryIncrease,
          isRegression,
        },
      });

      const status = isRegression ? '❌ REGRESSION' : '✅ OK';
      console.log(`    ${status}: ${avgResult.executionMs.toFixed(2)}ms (${executionIncrease.toFixed(1)}% change)`);
    }

    return regressions;
  }

  generateReport(regressions: RegressionResult[]): string {
    const hasRegressions = regressions.some(r => r.regression.isRegression);
    
    let report = `# Performance Report\n\n`;
    report += `Generated: ${new Date().toISOString()}\n`;
    report += `Status: ${hasRegressions ? '❌ REGRESSIONS DETECTED' : '✅ NO REGRESSIONS'}\n\n`;

    report += `## Results Summary\n\n`;
    report += `| Test | Current (ms) | Baseline (ms) | Change | Memory Change | Status |\n`;
    report += `|------|--------------|---------------|--------|---------------|--------|\n`;

    for (const regression of regressions) {
      const { testName, current, baseline, regression: reg } = regression;
      const status = reg.isRegression ? '❌' : '✅';
      const execChange = reg.executionTimeIncrease > 0 ? `+${reg.executionTimeIncrease.toFixed(1)}%` : `${reg.executionTimeIncrease.toFixed(1)}%`;
      const memChange = reg.memoryIncrease > 0 ? `+${reg.memoryIncrease.toFixed(1)}%` : `${reg.memoryIncrease.toFixed(1)}%`;

      report += `| ${testName} | ${current.executionMs.toFixed(2)} | ${baseline.avgExecutionMs.toFixed(2)} | ${execChange} | ${memChange} | ${status} |\n`;
    }

    if (hasRegressions) {
      report += `\n## 🚨 Regressions Detected\n\n`;
      const regressedTests = regressions.filter(r => r.regression.isRegression);
      
      for (const regression of regressedTests) {
        report += `### ${regression.testName}\n`;
        report += `- Execution time: ${regression.current.executionMs.toFixed(2)}ms → ${regression.baseline.avgExecutionMs.toFixed(2)}ms (${regression.regression.executionTimeIncrease.toFixed(1)}% increase)\n`;
        report += `- Memory usage: ${regression.current.memoryMB.toFixed(2)}MB → ${regression.baseline.avgMemoryMB.toFixed(2)}MB (${regression.regression.memoryIncrease.toFixed(1)}% increase)\n`;
        report += `- Threshold: ${this.REGRESSION_THRESHOLD}% execution, ${this.MEMORY_THRESHOLD}% memory\n\n`;
      }
    }

    report += `## Detailed Metrics\n\n`;
    for (const regression of regressions) {
      report += `### ${regression.testName}\n`;
      report += `- **Current Run**: ${regression.current.executionMs.toFixed(2)}ms, ${regression.current.memoryMB.toFixed(2)}MB\n`;
      report += `- **Baseline**: ${regression.baseline.avgExecutionMs.toFixed(2)}ms avg, ${regression.baseline.avgMemoryMB.toFixed(2)}MB avg\n`;
      report += `- **Diagnostics**: ${regression.current.diagnosticCount} found\n\n`;
    }

    return report;
  }

  cleanup(): void {
    // Clean up temporary test files
    const tempFiles = ['/tmp/perf-test.ts', '/tmp/perf-test.py'];
    for (const file of tempFiles) {
      try {
        if (existsSync(file)) {
          require('fs').unlinkSync(file);
        }
      } catch {
        // Ignore cleanup errors
      }
    }
  }
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  const monitor = new PerformanceMonitor();

  try {
    switch (command) {
      case '--baseline':
        await monitor.createBaseline();
        break;

      case '--check':
        const regressions = await monitor.checkRegression();
        const report = monitor.generateReport(regressions);
        console.log('\n' + report);
        
        // Write report to file
        writeFileSync('performance-report.md', report);
        console.log('Report saved to: performance-report.md');
        
        // Exit with error code if regressions detected
        const hasRegressions = regressions.some(r => r.regression.isRegression);
        if (hasRegressions) {
          console.error('\n❌ Performance regressions detected!');
          process.exit(1);
        } else {
          console.log('\n✅ No performance regressions detected.');
        }
        break;

      case '--report':
        if (!existsSync('performance-report.md')) {
          console.error('No performance report found. Run --check first.');
          process.exit(1);
        }
        console.log(readFileSync('performance-report.md', 'utf-8'));
        break;

      default:
        console.log('Usage:');
        console.log('  bun run scripts/performance-monitor.ts --baseline  # Create baseline');
        console.log('  bun run scripts/performance-monitor.ts --check     # Check for regressions');
        console.log('  bun run scripts/performance-monitor.ts --report    # Display last report');
        process.exit(1);
    }
  } catch (error) {
    console.error('❌ Performance monitoring failed:', error);
    process.exit(1);
  } finally {
    monitor.cleanup();
  }
}

if (import.meta.main) {
  main();
}
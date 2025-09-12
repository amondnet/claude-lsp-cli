# Performance Benchmarking Guide

This document explains how to use the performance benchmarking and monitoring tools in claude-lsp-cli.

## Overview

The claude-lsp-cli project includes comprehensive performance monitoring to:

- **Track performance trends** over time
- **Detect regressions** in CI/CD pipelines  
- **Benchmark different languages** and file sizes
- **Monitor memory usage** and execution times
- **Maintain performance baselines** for comparison

## Quick Start

```bash
# Run performance tests (part of regular test suite)
bun run test:performance

# Create comprehensive benchmarks for all languages
bun run benchmark:all

# Run TypeScript-specific benchmarks
bun run benchmark:typescript

# Create performance baseline for regression detection
bun run scripts/performance-monitor.ts --baseline

# Check for performance regressions
bun run scripts/performance-monitor.ts --check
```

## Tools and Scripts

### 1. Performance Test Suite (`tests/performance.test.ts`)

**Purpose**: Fast regression tests that run as part of the regular test suite.

**Features**:
- TypeScript, Python, and JavaScript performance tests
- Memory usage monitoring
- Execution time thresholds (5 seconds max)
- Memory thresholds (100MB increase max)
- Consistency testing across multiple runs
- Large diagnostic output handling tests

**Usage**:
```bash
bun run test:performance
```

**Example Output**:
```
TypeScript performance: 1247.23ms, 2.45MB, 4 diagnostics
Python performance: 892.67ms, 1.78MB, 3 diagnostics
JavaScript performance: 234.12ms, 0.89MB, 0 diagnostics
```

### 2. Comprehensive Benchmark Script (`scripts/benchmark.ts`)

**Purpose**: Detailed benchmarking with different file sizes and languages.

**Features**:
- Supports 5 languages: TypeScript, Python, JavaScript, Go, Rust
- 3 file sizes: small (1x), medium (5x), large (20x complexity)
- Auto-generates benchmark files with intentional errors
- Memory and execution time tracking
- JSON results export
- Detailed performance reports

**Usage**:
```bash
# All languages, all sizes
bun run benchmark:all

# Specific language
bun run benchmark:typescript
bun run benchmark:python

# Specific language and size
bun run scripts/benchmark.ts typescript small
bun run scripts/benchmark.ts python large
```

**Example Output**:
```
=== Performance Benchmark Results ===

--- TYPESCRIPT ---
Size       | Time (ms) | Memory (MB) | Diagnostics | File Size
-----------|-----------|-------------|-------------|----------
small      |   156.42 |       1.23 |           4 | 2.1 KB
medium     |   387.65 |       2.87 |          12 | 10.5 KB
large      |  1247.89 |       8.45 |          48 | 42.3 KB

=== Summary Statistics ===
Total execution time: 1791.96ms
Average time per check: 597.32ms
Fastest check: 156.42ms
Slowest check: 1247.89ms

Results saved to: benchmark-results-1694123456789.json
```

### 3. Performance Monitor (`scripts/performance-monitor.ts`)

**Purpose**: Regression detection and baseline management for CI/CD.

**Features**:
- Creates performance baselines
- Compares current performance against baselines
- Detects regressions (25% execution, 50% memory thresholds)
- Generates detailed reports
- Environment tracking (platform, versions)
- Statistical analysis with multiple sample runs

**Workflow**:
```bash
# 1. Create initial baseline
bun run scripts/performance-monitor.ts --baseline

# 2. After code changes, check for regressions
bun run scripts/performance-monitor.ts --check

# 3. View last report
bun run scripts/performance-monitor.ts --report
```

**Baseline File** (`performance-baseline.json`):
```json
{
  "timestamp": "2024-01-20T10:30:00.000Z",
  "commit": "abc123def456",
  "branch": "main",
  "environment": {
    "platform": "linux",
    "nodeVersion": "v20.0.0",
    "bunVersion": "1.0.0"
  },
  "metrics": {
    "typescript": {
      "avgExecutionMs": 156.42,
      "maxExecutionMs": 178.56,
      "avgMemoryMB": 1.23,
      "maxMemoryMB": 1.45,
      "diagnosticCount": 4,
      "sampleSize": 3
    }
  }
}
```

## CI/CD Integration

The performance monitoring is integrated into GitHub Actions:

### Performance Job

```yaml
performance:
  name: Performance Tests
  runs-on: ubuntu-latest
  needs: test-and-build
```

**Workflow**:
1. **Install dependencies** and language tools
2. **Download existing baseline** (if available)
3. **Create baseline** if none exists
4. **Run performance tests** 
5. **Check for regressions** and fail if detected
6. **Upload baseline and reports** as artifacts

**Artifacts Generated**:
- `performance-baseline.json` - Baseline metrics for future comparisons
- `performance-report.md` - Detailed performance analysis

### Regression Detection

The CI pipeline will **fail** if performance regressions are detected:

- **Execution time increase** > 25%
- **Memory usage increase** > 50%

Example failure:
```
❌ Performance regressions detected!

### typescript
- Execution time: 234.56ms → 156.42ms (49.9% increase)  
- Memory usage: 2.15MB → 1.23MB (74.8% increase)
- Threshold: 25% execution, 50% memory
```

## Performance Analysis

### Understanding Results

**Execution Time**:
- Measures actual file checking time
- Includes tool startup, parsing, and diagnostic generation
- Varies by language complexity and tool efficiency

**Memory Usage**:
- Heap memory delta during checking
- Indicates memory efficiency of checkers
- Important for resource-constrained environments

**Diagnostic Count**:
- Number of errors/warnings found
- Should be consistent for same test files
- Validates that functionality isn't broken

### Performance Characteristics by Language

Based on benchmarking data:

**Fastest**: JavaScript (ESLint) - ~200ms for medium files
**Moderate**: Python (Pyright), TypeScript (tsc) - ~400-600ms 
**Slower**: Rust (rustc), Go (go build) - ~800-1200ms
**Variable**: Java (javac) - depends on classpath and project size

### Optimization Guidelines

**For Contributors**:
1. Run `bun run test:performance` before submitting PRs
2. Use `bun run benchmark:all` for significant changes
3. Check baseline with performance monitor after refactoring
4. Profile memory usage for large file handling

**For Maintainers**:
1. Update baselines after intentional performance changes
2. Monitor CI performance job failures
3. Review performance reports in PR artifacts
4. Set appropriate thresholds for different languages

## Troubleshooting

### Common Issues

**Performance tests failing in CI**:
- Check if language tools are properly installed
- Verify baseline file exists and is valid
- Look at artifact downloads in CI logs

**Inconsistent benchmark results**:
- Ensure system is not under load during benchmarking
- Run multiple times and average results
- Check if background processes are interfering

**Memory measurements showing negative values**:
- Garbage collection can cause negative deltas
- Run with `--expose-gc` flag if available
- Use multiple samples for better accuracy

### Debugging Commands

```bash
# Verbose benchmark with detailed output
DEBUG=1 bun run scripts/benchmark.ts typescript

# Force garbage collection (if available)
bun --expose-gc run test:performance  

# Create fresh baseline
rm performance-baseline.json
bun run scripts/performance-monitor.ts --baseline

# Test specific language checker directly
bun run src/cli.ts diagnostics examples/typescript-project/src/index.ts
```

## Best Practices

### Running Benchmarks

1. **Close unnecessary applications** to reduce system noise
2. **Run multiple times** and average results
3. **Use consistent hardware** for baseline comparisons
4. **Monitor system resources** during benchmarking

### Writing Performance Tests

1. **Use small, consistent test files** for fast execution
2. **Include intentional errors** for diagnostic validation
3. **Set reasonable thresholds** based on language characteristics
4. **Test edge cases** like large files or many diagnostics

### CI Performance

1. **Keep performance tests fast** (<30 seconds total)
2. **Use artifact caching** for baselines
3. **Allow performance job failures** to be investigated
4. **Monitor trends** over time, not just individual runs

## Contributing Performance Improvements

When making performance-related changes:

1. **Run baseline before changes**: `bun run scripts/performance-monitor.ts --baseline`
2. **Make your changes**
3. **Test performance**: `bun run scripts/performance-monitor.ts --check`
4. **Include performance results** in PR description
5. **Update documentation** if adding new benchmarks

Performance improvements are welcome! Focus on:
- Reducing tool startup overhead
- Optimizing diagnostic parsing
- Minimizing memory allocation
- Caching expensive operations
- Parallel processing where safe

## Future Enhancements

Planned improvements to the performance system:

- **Historical tracking** with database storage
- **Performance visualization** with charts and graphs
- **Language-specific thresholds** based on tool characteristics
- **Parallel benchmarking** for faster execution
- **Integration with APM tools** like DataDog or New Relic
- **Performance budgets** for different file sizes
- **Real-world benchmarks** using actual project files
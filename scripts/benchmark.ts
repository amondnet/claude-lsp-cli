#!/usr/bin/env bun
/**
 * Performance benchmarking script for claude-lsp-cli
 * 
 * Usage:
 *   bun run scripts/benchmark.ts [language] [size]
 *   bun run scripts/benchmark.ts typescript small
 *   bun run scripts/benchmark.ts python large
 *   bun run scripts/benchmark.ts all
 */

import { checkFile } from '../src/file-checker';
import { performance } from 'perf_hooks';
import { writeFileSync, mkdirSync, statSync } from 'fs';
import { join } from 'path';

interface BenchmarkResult {
  language: string;
  fileSize: 'small' | 'medium' | 'large';
  fileName: string;
  fileSizeBytes: number;
  executionTimeMs: number;
  diagnosticCount: number;
  memoryUsageMB: number;
  timestamp: string;
}

interface BenchmarkSuite {
  [key: string]: {
    small: string;
    medium: string;
    large: string;
  };
}

// Test files for different languages and sizes
const BENCHMARK_FILES: BenchmarkSuite = {
  typescript: {
    small: 'benchmarks/typescript/small.ts',
    medium: 'benchmarks/typescript/medium.ts',
    large: 'benchmarks/typescript/large.ts',
  },
  python: {
    small: 'benchmarks/python/small.py',
    medium: 'benchmarks/python/medium.py',
    large: 'benchmarks/python/large.py',
  },
  javascript: {
    small: 'benchmarks/javascript/small.js',
    medium: 'benchmarks/javascript/medium.js',
    large: 'benchmarks/javascript/large.js',
  },
  go: {
    small: 'benchmarks/go/small.go',
    medium: 'benchmarks/go/medium.go',
    large: 'benchmarks/go/large.go',
  },
  rust: {
    small: 'benchmarks/rust/small.rs',
    medium: 'benchmarks/rust/medium.rs',
    large: 'benchmarks/rust/large.rs',
  },
};

class PerformanceBenchmark {
  private results: BenchmarkResult[] = [];

  async runBenchmark(language: string, size: 'small' | 'medium' | 'large'): Promise<BenchmarkResult> {
    const filePath = BENCHMARK_FILES[language]?.[size];
    if (!filePath) {
      throw new Error(`No benchmark file found for ${language} ${size}`);
    }

    // Ensure benchmark file exists, create if needed
    await this.ensureBenchmarkFile(language, size, filePath);

    // Get file size
    const fileSizeBytes = statSync(filePath).size;

    // Measure memory before
    const memBefore = process.memoryUsage();

    // Run the benchmark
    const startTime = performance.now();
    const result = await checkFile(filePath);
    const endTime = performance.now();

    // Measure memory after
    const memAfter = process.memoryUsage();
    const memoryUsageMB = (memAfter.heapUsed - memBefore.heapUsed) / 1024 / 1024;

    const benchmarkResult: BenchmarkResult = {
      language,
      fileSize: size,
      fileName: filePath,
      fileSizeBytes,
      executionTimeMs: endTime - startTime,
      diagnosticCount: result.diagnostics?.length || 0,
      memoryUsageMB: Math.max(0, memoryUsageMB),
      timestamp: new Date().toISOString(),
    };

    this.results.push(benchmarkResult);
    return benchmarkResult;
  }

  async ensureBenchmarkFile(language: string, size: 'small' | 'medium' | 'large', filePath: string): Promise<void> {
    const dir = join(process.cwd(), filePath.split('/').slice(0, -1).join('/'));
    
    try {
      mkdirSync(dir, { recursive: true });
    } catch {
      // Directory might already exist
    }

    const fullPath = join(process.cwd(), filePath);
    
    try {
      statSync(fullPath);
    } catch {
      const content = this.generateBenchmarkFile(language, size);
      writeFileSync(fullPath, content);
      console.log(`Created benchmark file: ${filePath}`);
    }
  }

  generateBenchmarkFile(language: string, size: 'small' | 'medium' | 'large'): string {
    const sizeMultiplier = size === 'small' ? 1 : size === 'medium' ? 5 : 20;
    
    switch (language) {
      case 'typescript':
        return this.generateTypeScriptFile(sizeMultiplier);
      case 'python':
        return this.generatePythonFile(sizeMultiplier);
      case 'javascript':
        return this.generateJavaScriptFile(sizeMultiplier);
      case 'go':
        return this.generateGoFile(sizeMultiplier);
      case 'rust':
        return this.generateRustFile(sizeMultiplier);
      default:
        throw new Error(`Unknown language: ${language}`);
    }
  }

  generateTypeScriptFile(multiplier: number): string {
    const functions = Array.from({ length: multiplier * 10 }, (_, i) => `
function processData${i}(input: string): { result: string; count: number } {
  const lines = input.split('\\n');
  let count = 0;
  const result = lines.map(line => {
    count++;
    return line.trim().toUpperCase();
  }).join('\\n');
  return { result, count };
}

interface DataProcessor${i} {
  id: number;
  name: string;
  process(data: string): { result: string; count: number };
}

class DataProcessor${i}Impl implements DataProcessor${i} {
  constructor(public id: number, public name: string) {}
  
  process(data: string): { result: string; count: number } {
    return processData${i}(data);
  }
}
`).join('\n');

    return `// TypeScript benchmark file - ${multiplier}x complexity
${functions}

// Main execution
export function runBenchmark(): void {
  const processors: DataProcessor0[] = [];
  for (let i = 0; i < ${multiplier * 5}; i++) {
    processors.push(new DataProcessor0Impl(i, \`processor-\${i}\`));
  }
  
  const testData = "sample\\ndata\\nfor\\ntesting";
  processors.forEach(processor => {
    processor.process(testData);
  });
}

// Intentional type errors for diagnostic testing
const invalidAssignment: string = 123;
const undefinedProperty = someObject.nonExistentProperty;
`;
  }

  generatePythonFile(multiplier: number): string {
    const functions = Array.from({ length: multiplier * 8 }, (_, i) => `
def process_data_${i}(input_str: str) -> dict:
    """Process input string and return result dictionary."""
    lines = input_str.split('\\n')
    count = 0
    result_lines = []
    
    for line in lines:
        count += 1
        result_lines.append(line.strip().upper())
    
    return {'result': '\\n'.join(result_lines), 'count': count}

class DataProcessor${i}:
    def __init__(self, processor_id: int, name: str):
        self.id = processor_id
        self.name = name
    
    def process(self, data: str) -> dict:
        return process_data_${i}(data)
`).join('\n');

    return `# Python benchmark file - ${multiplier}x complexity
from typing import Dict, List
${functions}

def run_benchmark() -> None:
    """Run the benchmark test."""
    processors: List[DataProcessor0] = []
    for i in range(${multiplier * 5}):
        processors.append(DataProcessor0(i, f"processor-{i}"))
    
    test_data = "sample\\ndata\\nfor\\ntesting"
    for processor in processors:
        processor.process(test_data)

# Intentional type errors for diagnostic testing
invalid_assignment: str = 123
undefined_variable = some_undefined_variable
`;
  }

  generateJavaScriptFile(multiplier: number): string {
    const functions = Array.from({ length: multiplier * 10 }, (_, i) => `
function processData${i}(input) {
  const lines = input.split('\\n');
  let count = 0;
  const result = lines.map(line => {
    count++;
    return line.trim().toUpperCase();
  }).join('\\n');
  return { result, count };
}

class DataProcessor${i} {
  constructor(id, name) {
    this.id = id;
    this.name = name;
  }
  
  process(data) {
    return processData${i}(data);
  }
}
`).join('\n');

    return `// JavaScript benchmark file - ${multiplier}x complexity
${functions}

function runBenchmark() {
  const processors = [];
  for (let i = 0; i < ${multiplier * 5}; i++) {
    processors.push(new DataProcessor0(i, \`processor-\${i}\`));
  }
  
  const testData = "sample\\ndata\\nfor\\ntesting";
  processors.forEach(processor => {
    processor.process(testData);
  });
}

// Potential issues for linting
var unusedVariable = "test";
console.log(undefinedVariable);
`;
  }

  generateGoFile(multiplier: number): string {
    const functions = Array.from({ length: multiplier * 8 }, (_, i) => `
func processData${i}(input string) (map[string]interface{}, error) {
  lines := strings.Split(input, "\\n")
  count := 0
  var resultLines []string
  
  for _, line := range lines {
    count++
    resultLines = append(resultLines, strings.ToUpper(strings.TrimSpace(line)))
  }
  
  return map[string]interface{}{
    "result": strings.Join(resultLines, "\\n"),
    "count":  count,
  }, nil
}

type DataProcessor${i} struct {
  ID   int
  Name string
}

func (dp *DataProcessor${i}) Process(data string) (map[string]interface{}, error) {
  return processData${i}(data)
}
`).join('\n');

    return `package main

import (
  "fmt"
  "strings"
)

${functions}

func runBenchmark() {
  var processors []*DataProcessor0
  for i := 0; i < ${multiplier * 5}; i++ {
    processors = append(processors, &DataProcessor0{ID: i, Name: fmt.Sprintf("processor-%d", i)})
  }
  
  testData := "sample\\ndata\\nfor\\ntesting"
  for _, processor := range processors {
    _, err := processor.Process(testData)
    if err != nil {
      fmt.Printf("Error processing: %v\\n", err)
    }
  }
}

func main() {
  runBenchmark()
}

// Intentional issues for diagnostic testing
func invalidFunction() {
  undeclaredVariable = "test"
}
`;
  }

  generateRustFile(multiplier: number): string {
    const functions = Array.from({ length: multiplier * 6 }, (_, i) => `
fn process_data_${i}(input: &str) -> Result<(String, usize), String> {
  let lines: Vec<&str> = input.split('\\n').collect();
  let mut count = 0;
  let mut result_lines = Vec::new();
  
  for line in lines {
    count += 1;
    result_lines.push(line.trim().to_uppercase());
  }
  
  Ok((result_lines.join("\\n"), count))
}

struct DataProcessor${i} {
  id: u32,
  name: String,
}

impl DataProcessor${i} {
  fn new(id: u32, name: String) -> Self {
    DataProcessor${i} { id, name }
  }
  
  fn process(&self, data: &str) -> Result<(String, usize), String> {
    process_data_${i}(data)
  }
}
`).join('\n');

    return `// Rust benchmark file - ${multiplier}x complexity
use std::collections::HashMap;

${functions}

fn run_benchmark() -> Result<(), String> {
  let mut processors: Vec<DataProcessor0> = Vec::new();
  for i in 0..${multiplier * 5} {
    processors.push(DataProcessor0::new(i, format!("processor-{}", i)));
  }
  
  let test_data = "sample\\ndata\\nfor\\ntesting";
  for processor in &processors {
    match processor.process(test_data) {
      Ok(_) => {},
      Err(e) => println!("Error processing: {}", e),
    }
  }
  
  Ok(())
}

fn main() {
  if let Err(e) = run_benchmark() {
    println!("Benchmark failed: {}", e);
  }
}

// Intentional issues for diagnostic testing
fn invalid_function() {
  let unused_variable = "test";
  // undeclared_variable = "test"; // This would cause compile error
}
`;
  }

  printResults(): void {
    console.log('\n=== Performance Benchmark Results ===\n');
    
    if (this.results.length === 0) {
      console.log('No benchmark results to display.');
      return;
    }

    // Group results by language
    const grouped = this.results.reduce((acc, result) => {
      if (!acc[result.language]) {
        acc[result.language] = [];
      }
      acc[result.language].push(result);
      return acc;
    }, {} as { [key: string]: BenchmarkResult[] });

    for (const [language, results] of Object.entries(grouped)) {
      console.log(`\n--- ${language.toUpperCase()} ---`);
      console.log('Size       | Time (ms) | Memory (MB) | Diagnostics | File Size');
      console.log('-----------|-----------|-------------|-------------|----------');
      
      results.forEach(result => {
        const timeStr = result.executionTimeMs.toFixed(2).padStart(8);
        const memStr = result.memoryUsageMB.toFixed(2).padStart(10);
        const diagStr = result.diagnosticCount.toString().padStart(10);
        const sizeStr = (result.fileSizeBytes / 1024).toFixed(1) + ' KB';
        
        console.log(`${result.fileSize.padEnd(10)} | ${timeStr} | ${memStr} | ${diagStr} | ${sizeStr}`);
      });
    }

    // Overall statistics
    console.log('\n=== Summary Statistics ===');
    const totalTime = this.results.reduce((sum, r) => sum + r.executionTimeMs, 0);
    const avgTime = totalTime / this.results.length;
    const maxTime = Math.max(...this.results.map(r => r.executionTimeMs));
    const minTime = Math.min(...this.results.map(r => r.executionTimeMs));

    console.log(`Total execution time: ${totalTime.toFixed(2)}ms`);
    console.log(`Average time per check: ${avgTime.toFixed(2)}ms`);
    console.log(`Fastest check: ${minTime.toFixed(2)}ms`);
    console.log(`Slowest check: ${maxTime.toFixed(2)}ms`);
  }

  saveResults(outputPath: string = 'benchmark-results.json'): void {
    const output = {
      timestamp: new Date().toISOString(),
      results: this.results,
      summary: {
        totalTests: this.results.length,
        totalTime: this.results.reduce((sum, r) => sum + r.executionTimeMs, 0),
        averageTime: this.results.reduce((sum, r) => sum + r.executionTimeMs, 0) / this.results.length,
        languages: [...new Set(this.results.map(r => r.language))],
      },
    };

    writeFileSync(outputPath, JSON.stringify(output, null, 2));
    console.log(`\nResults saved to: ${outputPath}`);
  }
}

// CLI execution
async function main() {
  const args = process.argv.slice(2);
  const language = args[0] || 'all';
  const size = args[1] as 'small' | 'medium' | 'large' | undefined;

  const benchmark = new PerformanceBenchmark();

  try {
    if (language === 'all') {
      console.log('Running comprehensive benchmarks for all languages...\n');
      
      for (const [lang, files] of Object.entries(BENCHMARK_FILES)) {
        console.log(`\nBenchmarking ${lang}...`);
        
        for (const sizeKey of ['small', 'medium', 'large'] as const) {
          try {
            console.log(`  Running ${sizeKey} test...`);
            await benchmark.runBenchmark(lang, sizeKey);
          } catch (error) {
            console.error(`  ❌ Failed ${lang} ${sizeKey}: ${error}`);
          }
        }
      }
    } else {
      if (!BENCHMARK_FILES[language]) {
        console.error(`❌ Unknown language: ${language}`);
        console.log(`Available languages: ${Object.keys(BENCHMARK_FILES).join(', ')}`);
        process.exit(1);
      }

      const sizes = size ? [size] : ['small', 'medium', 'large'] as const;
      
      console.log(`Running ${language} benchmarks...`);
      for (const testSize of sizes) {
        console.log(`  Running ${testSize} test...`);
        await benchmark.runBenchmark(language, testSize);
      }
    }

    benchmark.printResults();
    benchmark.saveResults(`benchmark-results-${Date.now()}.json`);

  } catch (error) {
    console.error('❌ Benchmark failed:', error);
    process.exit(1);
  }
}

if (import.meta.main) {
  main();
}
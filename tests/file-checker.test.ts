import { describe, test, expect, afterAll } from 'bun:test';
import { checkFile, formatDiagnostics } from '../src/file-checker';
import { writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';

const TEST_DIR = '/tmp/claude-lsp-file-test';

// Create test directory
mkdirSync(TEST_DIR, { recursive: true });

describe('File-Based Type Checker', () => {
  test('should check TypeScript files', async () => {
    const testFile = join(TEST_DIR, 'test.ts');
    writeFileSync(
      testFile,
      `
      const x: string = 42; // Type error
      const y: number = "hello"; // Type error
    `
    );

    const result = await checkFile(testFile);
    expect(result).toBeTruthy();
    expect(result!.tool).toBe('tsc');
    expect(result!.diagnostics.length).toBeGreaterThan(0);

    // Should find type errors
    const errors = result!.diagnostics.filter((d) => d.severity === 'error');
    expect(errors.length).toBeGreaterThanOrEqual(2);
  });

  test('should check Python files', async () => {
    const testFile = join(TEST_DIR, 'test.py');
    writeFileSync(
      testFile,
      `
def add(a: int, b: int) -> int:
    return a + b

result = add("hello", "world")  # Type error
    `
    );

    const result = await checkFile(testFile);
    if (result && result.diagnostics.length > 0) {
      // Pyright is installed
      expect(result.tool).toMatch(/pyright|mypy/);
      expect(result.diagnostics.some((d) => d.severity === 'error')).toBe(true);
    }
  });

  test('should return null for JavaScript files (not supported)', async () => {
    const testFile = join(TEST_DIR, 'test.js');
    writeFileSync(
      testFile,
      `
      const x = undefined;
      x.foo.bar; // Runtime error
    `
    );

    const result = await checkFile(testFile);
    expect(result).toBeNull();
    // JavaScript files are not supported in the direct tool invocation mode
  });

  test('should return null for unsupported files', async () => {
    const testFile = join(TEST_DIR, 'test.txt');
    writeFileSync(testFile, 'Just a text file');

    const result = await checkFile(testFile);
    expect(result).toBeNull();
  });

  test('should format diagnostics correctly', () => {
    const result = {
      file: '/path/to/test.ts',
      tool: 'tsc',
      diagnostics: [
        {
          line: 10,
          column: 5,
          severity: 'error' as const,
          message: "Type 'number' is not assignable to type 'string'",
        },
        {
          line: 20,
          column: 15,
          severity: 'warning' as const,
          message: 'Variable is declared but never used',
        },
      ],
    };

    const formatted = formatDiagnostics(result);
    expect(formatted).toContain('1 error(s) and 1 warning(s)');
    expect(formatted).toContain('[[system-message]]:');
    expect(formatted).toContain("Type 'number' is not assignable to type 'string'");
    expect(formatted).toContain('Variable is declared but never used');
  });

  test('should handle missing files', async () => {
    const result = await checkFile('/nonexistent/file.ts');
    expect(result).toBeNull();
  });

  test('should check multiple supported languages', async () => {
    // Ensure test directory exists
    mkdirSync(TEST_DIR, { recursive: true });

    // Test file extensions mapping for supported languages only
    const languages = [
      { ext: '.ts', content: 'const x: string = 42;' },
      { ext: '.tsx', content: 'const x: string = 42;' },
      { ext: '.py', content: 'x: str = 123' },
      { ext: '.go', content: 'package main\nfunc main() { var x int = "hello" }' },
      { ext: '.rs', content: 'fn main() { let x: i32 = "hello"; }' },
      { ext: '.java', content: 'class Test { void test() { int x = "hello"; } }' },
      { ext: '.php', content: '<?php\n$x = 123; ?>' },
    ];

    for (const lang of languages) {
      const testFile = join(TEST_DIR, `test${lang.ext}`);
      writeFileSync(testFile, lang.content);

      const result = await checkFile(testFile);
      // Some tools might not be installed, but should at least try to return a result
      expect(result).toBeTruthy();
    }
  }, 10000);
});

// Cleanup after tests
afterAll(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
});

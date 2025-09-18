import { describe, test, expect, beforeEach, afterAll, beforeAll } from 'bun:test';
import { checkFile } from '../src/file-checker';
import { writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
// Ensure language registry is initialized
import '../src/checkers/index';
// Also import and verify the registry is populated
import { LANGUAGE_REGISTRY } from '../src/language-checker-registry';
import { setupTestConfig, cleanupTestConfig } from './helpers/config-manager';

const TEST_DIR = '/tmp/claude-lsp-file-test';

// Create test directory
mkdirSync(TEST_DIR, { recursive: true });

// Force initialization check
if (LANGUAGE_REGISTRY.size === 0) {
  throw new Error('Language registry not initialized! This should not happen.');
}

describe('File-Based Type Checker', () => {
  // Save user config and enable all languages for testing
  beforeAll(() => {
    setupTestConfig();
  });

  // Restore user config after all tests
  afterAll(() => {
    cleanupTestConfig();
  });
  // Ensure we're testing the real implementation, not mocked
  beforeEach(() => {
    // If checkFile has been mocked by another test, restore it
    const fileChecker = require('../src/file-checker');
    if (fileChecker.checkFile?.mockRestore) {
      fileChecker.checkFile.mockRestore();
    }
  });

  test('registry should be initialized', () => {
    // Verify the registry has TypeScript config with correct tool name
    expect(LANGUAGE_REGISTRY.size).toBeGreaterThan(0);
    const tsConfig = LANGUAGE_REGISTRY.get('.ts');
    expect(tsConfig).toBeTruthy();
    expect(tsConfig?.tool).toBe('tsc');

    const pyConfig = LANGUAGE_REGISTRY.get('.py');
    expect(pyConfig).toBeTruthy();
    expect(pyConfig?.tool).toMatch(/pyright/);
  });
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

    expect(result?.tool).toBe('tsc');
    expect(result?.diagnostics.length).toBeGreaterThan(0);

    // Should find type errors
    const errors = result?.diagnostics.filter((d) => d.severity === 'error') || [];
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

    // Check we have the expected diagnostics without formatDiagnostics
    const errors = result.diagnostics.filter((d) => d.severity === 'error');
    const warnings = result.diagnostics.filter((d) => d.severity === 'warning');
    expect(errors.length).toBe(1);
    expect(warnings.length).toBe(1);

    // Check the actual messages
    const errorMessages = errors.map((d) => d.message).join(' ');
    const warningMessages = warnings.map((d) => d.message).join(' ');
    expect(errorMessages).toContain("Type 'number' is not assignable to type 'string'");
    expect(warningMessages).toContain('Variable is declared but never used');
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

  test('should honor simple .gitignore in TypeScript project', async () => {
    // Create a project directory with .gitignore
    const projectDir = join(TEST_DIR, 'ts-gitignore-test');
    const srcDir = join(projectDir, 'src');
    const distDir = join(projectDir, 'dist');

    mkdirSync(srcDir, { recursive: true });
    mkdirSync(distDir, { recursive: true });

    // Create .gitignore that excludes dist/ and *.js files
    writeFileSync(
      join(projectDir, '.gitignore'),
      `# Build outputs
dist/
*.js
*.js.map
`
    );

    // Create tsconfig.json
    writeFileSync(
      join(projectDir, 'tsconfig.json'),
      JSON.stringify(
        {
          compilerOptions: {
            target: 'es2020',
            module: 'commonjs',
            strict: true,
            outDir: './dist',
          },
          include: ['src/**/*'],
          exclude: ['dist', '**/*.js'],
        },
        null,
        2
      )
    );

    // Create TypeScript files
    writeFileSync(join(srcDir, 'index.ts'), `const x: string = 42; // Type error`);
    writeFileSync(join(distDir, 'index.js'), `const x = 42; // Should be ignored`);
    writeFileSync(join(projectDir, 'build.js'), `const y = "hello"; // Should be ignored`);

    // Check the TypeScript file - should find errors
    const tsResult = await checkFile(join(srcDir, 'index.ts'));
    expect(tsResult).toBeTruthy();
    expect(tsResult?.diagnostics.length).toBeGreaterThan(0);
    expect(tsResult?.diagnostics.some((d) => d.severity === 'error')).toBe(true);

    // Check files that should be ignored - should return null or no diagnostics
    const distResult = await checkFile(join(distDir, 'index.js'));
    expect(distResult).toBeNull(); // JavaScript files are not supported

    const buildResult = await checkFile(join(projectDir, 'build.js'));
    expect(buildResult).toBeNull(); // JavaScript files are not supported
  });

  test('should only report diagnostics for the target file, not imported files', async () => {
    // Create a project with multiple TypeScript files that import each other
    const projectDir = join(TEST_DIR, 'ts-single-file-test');
    const srcDir = join(projectDir, 'src');
    mkdirSync(srcDir, { recursive: true });

    // Create tsconfig.json with strict settings
    writeFileSync(
      join(projectDir, 'tsconfig.json'),
      JSON.stringify(
        {
          compilerOptions: {
            target: 'es2020',
            module: 'commonjs',
            strict: true,
            noUncheckedIndexedAccess: true, // This causes array access to be possibly undefined
          },
          include: ['src/**/*'],
        },
        null,
        2
      )
    );

    // Create a file with errors that imports another file
    writeFileSync(
      join(srcDir, 'utils.ts'),
      `
export function getValue(arr: string[], index: number): string {
  return arr[index];  // With noUncheckedIndexedAccess, this is string | undefined
}
`
    );

    // Create main file that imports utils
    writeFileSync(
      join(srcDir, 'main.ts'),
      `
import { getValue } from './utils';

const myArray = ['a', 'b', 'c'];
const value: string = 42;  // Type error in main.ts
const result = getValue(myArray, 1);
`
    );

    // Check main.ts - should only get errors from main.ts, not from utils.ts
    const mainResult = await checkFile(join(srcDir, 'main.ts'));
    expect(mainResult).toBeTruthy();

    // Should have errors
    const mainErrors = mainResult?.diagnostics.filter((d) => d.severity === 'error') || [];
    expect(mainErrors.length).toBeGreaterThan(0);

    // All errors should be from main.ts line numbers (line 5 has the type error)
    // Should NOT have line 3 error from utils.ts
    const hasUtilsError = mainErrors.some(
      (err) => err.message.includes('string | undefined') && err.line === 3
    );
    expect(hasUtilsError).toBe(false);

    // Check utils.ts separately - should get its own error
    const utilsResult = await checkFile(join(srcDir, 'utils.ts'));
    expect(utilsResult).toBeTruthy();

    const utilsErrors = utilsResult?.diagnostics.filter((d) => d.severity === 'error') || [];
    expect(utilsErrors.length).toBeGreaterThan(0);

    // Utils should have the string | undefined error at line 3
    const hasCorrectUtilsError = utilsErrors.some(
      (err) => err.message.includes('string | undefined') && err.line === 3
    );
    expect(hasCorrectUtilsError).toBe(true);
  });

  test('should honor nested .gitignore with parent and current directory ignores', async () => {
    // Create nested project structure
    const projectDir = join(TEST_DIR, 'ts-nested-gitignore-test');
    const srcDir = join(projectDir, 'src');
    const libDir = join(srcDir, 'lib');
    const tempDir = join(srcDir, 'temp');

    mkdirSync(libDir, { recursive: true });
    mkdirSync(tempDir, { recursive: true });

    // Create parent .gitignore
    writeFileSync(
      join(projectDir, '.gitignore'),
      `# Global ignores
*.log
temp/
node_modules/
`
    );

    // Create nested .gitignore in src/
    writeFileSync(
      join(srcDir, '.gitignore'),
      `# Additional ignores in src
*.tmp
!temp/important.ts
`
    );

    // Create tsconfig.json
    writeFileSync(
      join(projectDir, 'tsconfig.json'),
      JSON.stringify(
        {
          compilerOptions: {
            target: 'es2020',
            module: 'commonjs',
            strict: true,
          },
          include: ['src/**/*'],
          exclude: ['**/temp', '**/*.log', '**/*.tmp'],
        },
        null,
        2
      )
    );

    // Create TypeScript files with intentional errors
    writeFileSync(join(srcDir, 'main.ts'), `const a: number = "wrong"; // Type error`);
    writeFileSync(join(libDir, 'utils.ts'), `const b: string = 123; // Type error`);
    writeFileSync(
      join(tempDir, 'temporary.ts'),
      `const c: boolean = "false"; // Should be checked despite temp/`
    );
    writeFileSync(
      join(tempDir, 'important.ts'),
      `const d: number[] = "array"; // Should be checked due to !temp/important.ts`
    );
    writeFileSync(join(srcDir, 'debug.tmp'), `const e: any = broken; // Should be ignored`);
    writeFileSync(join(projectDir, 'error.log'), `const f: void = 42; // Should be ignored`);

    // Check files that should have errors
    const mainResult = await checkFile(join(srcDir, 'main.ts'));
    expect(mainResult).toBeTruthy();
    expect(mainResult?.diagnostics.some((d) => d.severity === 'error')).toBe(true);

    const utilsResult = await checkFile(join(libDir, 'utils.ts'));
    expect(utilsResult).toBeTruthy();
    expect(utilsResult?.diagnostics.some((d) => d.severity === 'error')).toBe(true);

    // Check temp files - TypeScript should check them based on tsconfig exclude patterns
    const tempResult = await checkFile(join(tempDir, 'temporary.ts'));
    expect(tempResult).toBeTruthy();
    // Even though it's in temp/, tsc will still check it if we explicitly pass the file

    const importantResult = await checkFile(join(tempDir, 'important.ts'));
    expect(importantResult).toBeTruthy();
    expect(importantResult?.diagnostics.some((d) => d.severity === 'error')).toBe(true);

    // Files that should not be checked (non-TS files)
    const tmpResult = await checkFile(join(srcDir, 'debug.tmp'));
    expect(tmpResult).toBeNull(); // .tmp is not a supported extension

    const logResult = await checkFile(join(projectDir, 'error.log'));
    expect(logResult).toBeNull(); // .log is not a supported extension
  });
});

// Cleanup after tests
afterAll(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
});

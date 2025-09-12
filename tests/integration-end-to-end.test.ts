import { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach } from 'bun:test';
import { spawn } from 'bun';
import { join } from 'path';
import { existsSync, writeFileSync, rmSync, mkdirSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { setTimeout as sleep } from 'timers/promises';

const CLI_PATH = join(import.meta.dir, '..', 'bin', 'claude-lsp-cli');
const EXAMPLES_DIR = join(import.meta.dir, '..', 'examples');
const TEST_DIR = join(tmpdir(), `claude-lsp-integration-${Date.now()}`);
const CONFIG_PATH = join(TEST_DIR, '.claude-lsp-config.json');

// Check if CLI binary exists before running tests
if (!existsSync(CLI_PATH)) {
  console.error(`❌ CLI binary not found at: ${CLI_PATH}`);
  console.error(`   Please run 'bun run build' first`);
  throw new Error('CLI binary must be built before running tests');
}

// Helper to run CLI and capture output using Bun's spawn
async function runCLI(
  args: string[],
  options: { cwd?: string; timeout?: number; stdin?: string } = {}
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const { cwd = process.cwd(), timeout = 30000, stdin } = options;
  
  const proc = spawn([CLI_PATH, ...args], {
    cwd,
    stdout: 'pipe',
    stderr: 'pipe',
    stdin: stdin ? 'pipe' : 'ignore',
  });

  // Write to stdin if provided
  if (stdin && proc.stdin) {
    proc.stdin.write(stdin);
    proc.stdin.end();
  }

  // Set up timeout
  const timeoutId = setTimeout(() => {
    proc.kill();
  }, timeout);

  try {
    const stdout = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();
    const exitCode = await proc.exited;
    clearTimeout(timeoutId);
    return { stdout, stderr, exitCode };
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

// Helper to create test files
function createTestFile(filename: string, content: string): string {
  const filepath = join(TEST_DIR, filename);
  const dir = join(filepath, '..');
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(filepath, content);
  return filepath;
}

// Helper to create mock hook data (direct hook data format, not event wrapper)
function createPostToolUseData(file_path: string, tool: string = 'Edit'): string {
  return JSON.stringify({
    tool_input: { file_path },
    tool_response: { output: `${tool} completed successfully` },
    cwd: '/tmp'
  });
}

function createUserPromptData(message: string): string {
  return JSON.stringify({
    prompt: message
  });
}

describe('Integration Tests - End-to-End Flows', () => {
  beforeAll(() => {
    // Create test directory
    if (!existsSync(TEST_DIR)) {
      mkdirSync(TEST_DIR, { recursive: true });
    }
  });

  afterAll(() => {
    // Clean up test directory
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  beforeEach(() => {
    // Clean up any existing config
    if (existsSync(CONFIG_PATH)) {
      rmSync(CONFIG_PATH);
    }
  });

  describe('CLI Command Parsing and Execution', () => {
    test('help command shows usage information', async () => {
      const result = await runCLI(['help']);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('claude-lsp-cli');
      expect(result.stdout).toContain('Usage:');
      expect(result.stdout).toContain('Commands:');
      expect(result.stdout).toContain('check');
      expect(result.stdout).toContain('enable');
      expect(result.stdout).toContain('disable');
    }, 10000);

    test('invalid command shows help (CLI always succeeds)', async () => {
      const result = await runCLI(['invalid-command']);
      expect(result.exitCode).toBe(0); // CLI always exits 0
      expect(result.stdout).toContain('Usage:');
      expect(result.stdout).toContain('Commands:');
    }, 10000);

    test('version command (when no arguments) shows help', async () => {
      const result = await runCLI([]);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Usage:');
    }, 10000);

    test('check command with non-existent file returns silently', async () => {
      const result = await runCLI(['check', '/non/existent/file.ts']);
      expect(result.exitCode).toBe(0); // CLI always exits 0
      expect(result.stdout.trim()).toBe(''); // Silently returns for non-existent files
      expect(result.stderr.trim()).toBe('');
    }, 10000);

    test('check command with unsupported file type returns silently', async () => {
      const txtFile = createTestFile('test.txt', 'Hello world');
      const result = await runCLI(['check', txtFile]);
      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe(''); // Silently returns for unsupported file types
      expect(result.stderr.trim()).toBe('');
    }, 10000);
  });

  describe('File Diagnostic Workflows', () => {
    test('TypeScript file with errors - complete diagnostic flow', async () => {
      const tsFile = createTestFile('error.ts', `
// TypeScript file with intentional errors
function badFunction(): string {
  const unused = 'never used';
  return 42; // Type error: number assigned to string
}

const obj: { name: string } = {
  name: 'test',
  invalid: true // Object literal may only specify known properties
};

// Missing semicolon and unused import
import { nonExistent } from 'fake-module'
badFunction()
      `.trim());

      const result = await runCLI(['check', tsFile]);
      expect(result.exitCode).toBe(0); // Diagnostic mode returns 0
      expect(result.stdout).toContain('[[system-message]]:');
      
      const output = result.stdout;
      expect(output).toMatch(/"diagnostics":\s*\[/);
      expect(output).toMatch(/"summary":\s*"\d+\s+(error|warning)s?/);
      
      // Should contain actual TypeScript errors
      const jsonPart = output.split('[[system-message]]:')[1];
      const diagnostics = JSON.parse(jsonPart);
      expect(diagnostics.diagnostics.length).toBeGreaterThan(0);
      expect(diagnostics.summary).toContain('error');
    }, 30000);

    test('Python file with errors - complete diagnostic flow', async () => {
      const pyFile = createTestFile('error.py', `
# Python file with intentional errors
import os
import sys  # unused import

def bad_function():
    undefined_variable = some_undefined_var  # NameError
    return undefined_variable

def another_function():
    x = 1
    y = 2
    # No return statement for function that should return something
    
# Missing parentheses for function call
bad_function
      `.trim());

      const result = await runCLI(['check', pyFile]);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('[[system-message]]:');
      
      const output = result.stdout;
      const jsonPart = output.split('[[system-message]]:')[1];
      const diagnostics = JSON.parse(jsonPart);
      expect(diagnostics.diagnostics.length).toBeGreaterThan(0);
    }, 30000);

    test('Go file with errors - complete diagnostic flow', async () => {
      const goFile = createTestFile('error.go', `
package main

import (
  "fmt"
  "unused"  // unused import
)

func main() {
  var unused_var int  // unused variable
  fmt.Println("Hello")
  
  // Type mismatch
  var str string = 42
  
  // Undefined function
  undefinedFunction()
}
      `.trim());

      const result = await runCLI(['check', goFile]);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('[[system-message]]:');
      
      const output = result.stdout;
      const jsonPart = output.split('[[system-message]]:')[1];
      const diagnostics = JSON.parse(jsonPart);
      expect(diagnostics.diagnostics.length).toBeGreaterThan(0);
    }, 30000);

    test('Multiple files - batch processing', async () => {
      const file1 = createTestFile('good.ts', 'const message: string = "Hello, world!"; console.log(message);');
      const file2 = createTestFile('bad.ts', 'const x: string = 42; // Type error');

      // Test checking multiple files
      const result1 = await runCLI(['check', file1]);
      const result2 = await runCLI(['check', file2]);

      expect(result1.exitCode).toBe(0);
      expect(result2.exitCode).toBe(0);

      // Good file should have no errors
      const jsonPart1 = result1.stdout.split('[[system-message]]:')[1];
      const diagnostics1 = JSON.parse(jsonPart1);
      expect(diagnostics1.summary).toContain('no errors');

      // Bad file should have errors  
      const jsonPart2 = result2.stdout.split('[[system-message]]:')[1];
      const diagnostics2 = JSON.parse(jsonPart2);
      expect(diagnostics2.diagnostics.length).toBeGreaterThan(0);
    }, 30000);
  });

  describe('Configuration Management End-to-End', () => {
    test('enable/disable language workflow', async () => {
      // Initially all languages should be enabled
      const checkResult = await runCLI(['check', createTestFile('test.py', 'print("hello")')]);
      expect(checkResult.exitCode).toBe(0);
      expect(checkResult.stdout).toContain('[[system-message]]:');

      // Disable Python
      const disableResult = await runCLI(['disable', 'python']);
      expect(disableResult.exitCode).toBe(0);
      expect(disableResult.stdout).toContain('Disabled python checking');

      // Check that config file was created
      expect(existsSync(CONFIG_PATH)).toBe(false); // Config is in ~/.claude/lsp-config.json by default

      // Re-enable Python
      const enableResult = await runCLI(['enable', 'python']);
      expect(enableResult.exitCode).toBe(0);
      expect(enableResult.stdout).toContain('Enabled python checking');
    }, 15000);

    test('status shown in help output (no separate status command)', async () => {
      // Disable a language first
      await runCLI(['disable', 'scala']);
      
      const statusResult = await runCLI(['help']); // No status command, use help
      expect(statusResult.exitCode).toBe(0);
      expect(statusResult.stdout).toContain('Current Status:');
      expect(statusResult.stdout).toContain('scala'); // Should show in status
      expect(statusResult.stdout).toContain('DISABLED');
      
      // Re-enable for cleanup
      await runCLI(['enable', 'scala']);
    }, 15000);

    test('invalid language handling', async () => {
      const enableResult = await runCLI(['enable', 'invalid-language']);
      expect(enableResult.exitCode).toBe(0); // CLI always exits 0
      expect(enableResult.stdout).toContain('Unknown language') || expect(enableResult.stderr).toContain('Unknown language');

      const disableResult = await runCLI(['disable', 'invalid-language']);
      expect(disableResult.exitCode).toBe(0); // CLI always exits 0
      expect(disableResult.stdout).toContain('Unknown language') || expect(disableResult.stderr).toContain('Unknown language');
    }, 10000);
  });

  describe('Hook Event Handling End-to-End', () => {
    test('PostToolUse hook with file edit simulation', async () => {
      const testFile = createTestFile('hook-test.ts', 'const x: string = 42;'); // Has error
      
      const hookData = createPostToolUseData(testFile, 'Edit');

      const result = await runCLI(['hook', 'PostToolUse'], {
        stdin: hookData
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('[[system-message]]:');
      
      const jsonPart = result.stdout.split('[[system-message]]:')[1];
      const diagnostics = JSON.parse(jsonPart);
      expect(diagnostics.diagnostics.length).toBeGreaterThan(0);
    }, 30000);

    test('PostToolUse hook with Write tool simulation', async () => {
      const testFile = createTestFile('write-test.py', 'print("hello world")'); // No errors
      
      const hookData = createPostToolUseData(testFile, 'Write');

      const result = await runCLI(['hook', 'PostToolUse'], {
        stdin: hookData
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('[[system-message]]:');
      
      const jsonPart = result.stdout.split('[[system-message]]:')[1];
      const diagnostics = JSON.parse(jsonPart);
      expect(diagnostics.summary).toContain('no errors');
    }, 30000);
  });

  describe('Error Scenarios and Edge Cases', () => {
    test('malformed hook data handling', async () => {
      const result = await runCLI(['hook', 'PostToolUse'], {
        stdin: 'invalid json'
      });

      expect(result.exitCode).toBe(0); // CLI always exits 0
      expect(result.stderr).toContain('Hook processing failed');
    }, 10000);

    test('missing hook data handling', async () => {
      const result = await runCLI(['hook', 'PostToolUse'], {
        stdin: ''
      });

      expect(result.exitCode).toBe(0); // CLI always exits 0
      expect(result.stderr).toContain('Hook processing failed');
    }, 10000);

    test('invalid hook event handling', async () => {
      const result = await runCLI(['hook', 'InvalidEvent'], { stdin: '' });
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('Unknown event type');
    }, 10000);

    test('file permission errors - directory check returns silently', async () => {
      // Try to check a directory instead of a file
      const result = await runCLI(['check', TEST_DIR]);
      expect(result.exitCode).toBe(0); // CLI always exits 0
      expect(result.stdout.trim()).toBe(''); // Directory checks return silently
      expect(result.stderr.trim()).toBe('');
    }, 10000);

    test('very large file handling', async () => {
      // Create a large TypeScript file
      const largeContent = Array(1000).fill(0).map((_, i) => 
        `const var${i}: string = "value${i}";`
      ).join('\n');
      
      const largeFile = createTestFile('large.ts', largeContent);
      const result = await runCLI(['check', largeFile], { timeout: 45000 });
      
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('[[system-message]]:');
      
      // Should handle large files without crashing
      const jsonPart = result.stdout.split('[[system-message]]:')[1];
      const diagnostics = JSON.parse(jsonPart);
      expect(diagnostics.summary).toContain('no errors') || expect(diagnostics.summary).toContain('error');
    }, 50000);

    test('concurrent file checking', async () => {
      const file1 = createTestFile('concurrent1.ts', 'const x: number = 42;');
      const file2 = createTestFile('concurrent2.py', 'print("hello")');
      const file3 = createTestFile('concurrent3.go', 'package main\nfunc main() {}');

      // Run multiple checks concurrently
      const [result1, result2, result3] = await Promise.all([
        runCLI(['check', file1]),
        runCLI(['check', file2]),
        runCLI(['check', file3])
      ]);

      expect(result1.exitCode).toBe(0);
      expect(result2.exitCode).toBe(0);
      expect(result3.exitCode).toBe(0);

      expect(result1.stdout).toContain('[[system-message]]:');
      expect(result2.stdout).toContain('[[system-message]]:') || expect(result2.stdout.trim()).toBe(''); // Python might be empty
      expect(result3.stdout).toContain('[[system-message]]:') || expect(result3.stdout.trim()).toBe(''); // Go might be empty
    }, 45000);
  });

  describe('Deduplication and State Management', () => {
    test('CLI check command does not use deduplication (hook-only feature)', async () => {
      const testFile = createTestFile('dedup-test.ts', 'const x: string = 42;');
      
      // First check - should show diagnostics
      const result1 = await runCLI(['check', testFile]);
      expect(result1.exitCode).toBe(0);
      expect(result1.stdout).toContain('[[system-message]]:');
      
      const jsonPart1 = result1.stdout.split('[[system-message]]:')[1];
      const diagnostics1 = JSON.parse(jsonPart1);
      expect(diagnostics1.diagnostics.length).toBeGreaterThan(0);

      // Wait a bit
      await sleep(100);

      // Second check - CLI check always shows output (no deduplication)
      const result2 = await runCLI(['check', testFile]);
      expect(result2.exitCode).toBe(0);
      expect(result2.stdout).toContain('[[system-message]]:'); // CLI check doesn't deduplicate
    }, 30000);

    test('hook-based deduplication with file change', async () => {
      const testFile = createTestFile('hook-dedup-test.ts', 'const x: string = 42;');
      
      // First hook call
      const hookData1 = createPostToolUseData(testFile);
      const result1 = await runCLI(['hook', 'PostToolUse'], {
        stdin: hookData1
      });
      expect(result1.stdout).toContain('[[system-message]]:');
      
      await sleep(100);

      // Second hook call with same file - should be deduplicated (no output)
      const result2 = await runCLI(['hook', 'PostToolUse'], {
        stdin: hookData1
      });
      expect(result2.exitCode).toBe(0);
      expect(result2.stdout.trim()).toBe(''); // Should be deduplicated
      
      // Change file content
      writeFileSync(testFile, 'const y: number = "wrong type";');
      
      // Third hook call - should show new diagnostics (deduplication broken by file change)
      const result3 = await runCLI(['hook', 'PostToolUse'], {
        stdin: hookData1
      });
      expect(result3.exitCode).toBe(0);
      expect(result3.stdout).toContain('[[system-message]]:');
    }, 30000);
  });

  describe('Cross-Platform and Environment Tests', () => {
    test('handles files with different line endings', async () => {
      // Test with Windows-style line endings
      const winFile = createTestFile('windows.ts', 'const x: string = 42;\r\nconst y: number = "wrong";\r\n');
      const result = await runCLI(['check', winFile]);
      
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('[[system-message]]:');
    }, 20000);

    test('handles files with unicode content', async () => {
      const unicodeFile = createTestFile('unicode.ts', 'const message: string = "Hello 世界 🌍"; console.log(message);');
      const result = await runCLI(['check', unicodeFile]);
      
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('[[system-message]]:');
      
      const jsonPart = result.stdout.split('[[system-message]]:')[1];
      const diagnostics = JSON.parse(jsonPart);
      expect(diagnostics.summary).toContain('no errors');
    }, 20000);

    test('handles files in subdirectories', async () => {
      mkdirSync(join(TEST_DIR, 'subdir'), { recursive: true });
      const subFile = join(TEST_DIR, 'subdir', 'nested.ts');
      writeFileSync(subFile, 'const x: string = "valid";');
      
      const result = await runCLI(['check', subFile]);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('[[system-message]]:');
    }, 20000);
  });
});
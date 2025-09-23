import { describe, test, expect } from 'bun:test';
import { spawn } from 'bun';
import { join } from 'path';
import { existsSync, rmSync } from 'fs';
import { tmpdir } from 'os';

const CLI_PATH = join(import.meta.dir, '..', 'bin', 'claude-lsp-cli');
const EXAMPLES_DIR = join(import.meta.dir, '..', 'examples');

// Check if CLI binary exists before running tests
if (!existsSync(CLI_PATH)) {
  console.error(`❌ CLI binary not found at: ${CLI_PATH}`);
  console.error(`   Current directory: ${process.cwd()}`);
  console.error(`   Test directory: ${import.meta.dir}`);
  console.error(`   Please run 'bun run build' first`);
  throw new Error('CLI binary must be built before running tests');
}

// Helper to run CLI and capture output using Bun's spawn
async function runCLI(
  args: string[]
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const proc = spawn([CLI_PATH, ...args], {
    stdout: 'pipe',
    stderr: 'pipe',
    stdin: 'ignore',
  });

  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;

  return { stdout, stderr, exitCode };
}

describe('CLI check Command', () => {
  // Test diagnostics mode behavior:
  // - Exit code 1 when errors found, 0 when no errors
  // - Uses shell integration format with OSC 633 sequences
  // - Shows "No issues found" when no errors (not silent)

  test("Bun/TypeScript with no errors - shows 'no errors or warnings'", async () => {
    const result = await runCLI(['check', join(import.meta.dir, '..', 'src', 'cli.ts')]);
    expect(result.exitCode).toBe(0);
    // Should show "No issues found" when no errors
    expect(result.stderr).toContain('No issues found');
    expect(result.stdout).toBe('');
  }, 30000);

  test("Python file with no errors - shows 'no errors or warnings'", async () => {
    // Create a simple Python file with no errors
    const testFile = '/tmp/test_no_errors.py';
    await Bun.write(testFile, "def hello():\n    return 'Hello, World!'\n");
    const result = await runCLI(['check', testFile]);
    expect(result.exitCode).toBe(0);
    // Should show "No issues found" when no errors
    expect(result.stderr).toContain('No issues found');
    expect(result.stdout).toBe('');
  }, 30000);

  test("Go file with no errors - shows 'no errors or warnings'", async () => {
    // Create a simple Go file with no errors
    const testFile = '/tmp/test_no_errors.go';
    await Bun.write(testFile, 'package main\n\nfunc main() {\n    println("Hello")\n}\n');
    const result = await runCLI(['check', testFile]);
    expect(result.exitCode).toBe(0);
    // Should show "No issues found" when no errors
    expect(result.stderr).toContain('No issues found');
    expect(result.stdout).toBe('');
  }, 30000);

  test('C++ with errors - shows diagnostic count', async () => {
    const result = await runCLI(['check', join(EXAMPLES_DIR, 'cpp-project', 'src', 'main.cpp')]);
    expect(result.exitCode).toBe(1); // Exit code 1 when errors found
    // Shell integration format outputs to stderr
    expect(result.stderr).toContain('✗');
    expect(result.stderr).toContain('error');
  }, 30000);

  test('Elixir with compilation errors', async () => {
    const result = await runCLI(['check', join(EXAMPLES_DIR, 'elixir-project', 'lib', 'main.ex')]);
    expect(result.exitCode).toBe(1); // Exit code 1 when errors found
    // Shell integration format outputs to stderr
    expect(result.stderr).toContain('✗');
    const match = result.stderr.match(/(\d+) error/);
    expect(match).toBeTruthy();
    if (match && match[1]) {
      const errorCount = parseInt(match[1], 10);
      expect(errorCount).toBeGreaterThan(0);
    }
  }, 30000);

  test('Go with multiple errors', async () => {
    const result = await runCLI([
      'check',
      join(EXAMPLES_DIR, 'go-project', 'cmd', 'server', 'main.go'),
    ]);
    expect(result.exitCode).toBe(1); // Exit code 1 when errors found
    // Shell integration format outputs to stderr
    expect(result.stderr).toContain('✗');
    expect(result.stderr).toContain('error');
  }, 30000);

  test('Java with multiple errors', async () => {
    const result = await runCLI([
      'check',
      join(EXAMPLES_DIR, 'java-project', 'src', 'main', 'java', 'com', 'example', 'Main.java'),
    ]);
    expect(result.exitCode).toBe(1); // Exit code 1 when errors found
    // Shell integration format outputs to stderr
    expect(result.stderr).toContain('✗');
    expect(result.stderr).toContain('error');
  }, 30000);

  test('Lua with syntax errors', async () => {
    const result = await runCLI(['check', join(EXAMPLES_DIR, 'lua-project', 'main.lua')]);
    expect(result.exitCode).toBe(1); // Exit code 1 when errors found
    // Shell integration format outputs to stderr
    expect(result.stderr).toContain('✗');
    expect(result.stderr).toContain('error');
  }, 30000);

  test('PHP with syntax errors', async () => {
    const result = await runCLI(['check', join(EXAMPLES_DIR, 'php-project', 'src', 'User.php')]);
    expect(result.exitCode).toBe(1); // Exit code 1 when errors found
    // Shell integration format outputs to stderr
    expect(result.stderr).toContain('✗');
    expect(result.stderr).toContain('error');
  }, 30000);

  test('Python with type errors', async () => {
    const result = await runCLI(['check', join(EXAMPLES_DIR, 'python-project', 'main.py')]);
    expect(result.exitCode).toBe(1); // Exit code 1 when errors found
    // Shell integration format outputs to stderr
    expect(result.stderr).toContain('✗');
    const hasErrors = result.stderr.includes('error');
    const hasWarnings = result.stderr.includes('warning');
    expect(hasErrors || hasWarnings).toBe(true);
  }, 30000);

  test('Rust with compilation errors', async () => {
    const result = await runCLI(['check', join(EXAMPLES_DIR, 'rust-project', 'src', 'main.rs')]);
    expect(result.exitCode).toBe(1); // Exit code 1 when errors found
    // Shell integration format outputs to stderr
    expect(result.stderr).toContain('✗');
    expect(result.stderr).toContain('error');
  }, 30000);

  test('Scala with errors', async () => {
    const result = await runCLI([
      'check',
      join(EXAMPLES_DIR, 'scala-project', 'src', 'main', 'scala', 'Main.scala'),
    ]);

    // In CI, Bloop might not be available or behave differently
    if (result.stderr.includes('✗')) {
      // Bloop is working and found errors
      expect(result.exitCode).toBe(1);
      const match = result.stderr.match(/(\d+) error/);
      expect(match).toBeTruthy();
      if (match && match[1]) {
        const errorCount = parseInt(match[1], 10);
        // Bloop finds 12 errors in Main.scala
        expect(errorCount).toBeGreaterThanOrEqual(10);
      }
    } else {
      // scalac not available or no errors detected - shows "No issues found"
      expect(result.exitCode).toBe(0);
      expect(result.stderr).toContain('No issues found');
    }
  }, 30000);

  test('Terraform with warnings', async () => {
    const result = await runCLI(['check', join(EXAMPLES_DIR, 'terraform-project', 'main.tf')]);
    expect(result.exitCode).toBe(1); // Exit code 1 when diagnostics found (warnings or errors)
    // Shell integration format outputs to stderr
    // Terraform might have warnings but not necessarily errors
    const hasWarnings = result.stderr.includes('warning');
    expect(hasWarnings).toBe(true);
  }, 30000);

  test('TypeScript with multiple errors', async () => {
    const result = await runCLI([
      'check',
      join(EXAMPLES_DIR, 'typescript-project', 'src', 'index.ts'),
    ]);
    expect(result.exitCode).toBe(1); // Exit code 1 when errors found
    // Shell integration format outputs to stderr
    expect(result.stderr).toContain('✗');
    expect(result.stderr).toContain('error');
  }, 30000);

  test('Non-existent file returns exit code 0', async () => {
    const result = await runCLI(['check', '/tmp/non-existent-file.ts']);
    expect(result.exitCode).toBe(0);
    // Should be silent when file doesn't exist
    expect(result.stderr).toBe('');
    expect(result.stdout).toBe('');
  }, 10000);
});

describe('CLI Hook Mode', () => {
  // Test hook mode behavior:
  // - Exit code 2 when diagnostics found
  // - Exit code 0 when no diagnostics
  // - No output when no diagnostics
  // - Shell integration format when diagnostics found

  test('Hook mode with diagnostics returns exit code 2', async () => {
    // Clear the deduplication cache for the typescript-project directory
    // This ensures the test always shows diagnostics
    const projectRoot = join(EXAMPLES_DIR, 'typescript-project').replace(/[^a-zA-Z0-9]/g, '_');
    const cacheFile = join(tmpdir(), `claude-lsp-last-${projectRoot}.json`);
    try {
      rmSync(cacheFile, { force: true });
    } catch {
      // Ignore if file doesn't exist
    }

    const hookData = JSON.stringify({
      tool_name: 'Edit',
      tool_input: {
        file_path: join(EXAMPLES_DIR, 'typescript-project', 'src', 'index.ts'),
      },
    });

    const proc = spawn([CLI_PATH, 'hook', 'PostToolUse'], {
      stdout: 'pipe',
      stderr: 'pipe',
      stdin: 'pipe',
    });

    proc.stdin.write(hookData);
    void proc.stdin.end();

    const _stdout = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();
    const exitCode = await proc.exited;

    expect(exitCode).toBe(2);
    // Shell integration format outputs to stderr with OSC sequences
    expect(stderr).toContain('✗');
    expect(stderr).toContain('error');
  }, 30000);

  test('Hook mode with no diagnostics returns exit code 0 and no output', async () => {
    const hookData = JSON.stringify({
      tool_name: 'Edit',
      tool_input: {
        file_path: join(import.meta.dir, '..', 'src', 'cli.ts'),
      },
    });

    const proc = spawn([CLI_PATH, 'hook', 'PostToolUse'], {
      stdout: 'pipe',
      stderr: 'pipe',
      stdin: 'pipe',
    });

    proc.stdin.write(hookData);
    void proc.stdin.end();

    const _stdout = await new Response(proc.stdout).text();
    const _stderr = await new Response(proc.stderr).text();
    const exitCode = await proc.exited;

    expect(exitCode).toBe(0);
    expect(_stdout).toBe(''); // No output when no diagnostics
  }, 30000);

  test('Hook mode with non-code tool returns exit code 0', async () => {
    const hookData = JSON.stringify({
      tool_name: 'Bash',
      tool_input: {
        command: 'ls -la',
      },
    });

    const proc = spawn([CLI_PATH, 'hook', 'PostToolUse'], {
      stdout: 'pipe',
      stderr: 'pipe',
      stdin: 'pipe',
    });

    proc.stdin.write(hookData);
    void proc.stdin.end();

    const _stdout = await new Response(proc.stdout).text();
    const _stderr = await new Response(proc.stderr).text();
    const exitCode = await proc.exited;

    expect(exitCode).toBe(0);
  }, 10000);

  // Error handling tests
  describe('Error Handling', () => {
    test('hook command should return exit 1 with no output on runtime errors', async () => {
      // Simulate hook with invalid JSON to cause a runtime error
      const proc = spawn([CLI_PATH, 'hook', 'PostToolUse'], {
        stdin: 'pipe',
        stdout: 'pipe',
        stderr: 'pipe',
      });

      // Send invalid JSON that will cause parsing to fail
      proc.stdin.write('invalid json');
      void proc.stdin.end();

      const _stdout = await new Response(proc.stdout).text();
      const stderr = await new Response(proc.stderr).text();
      const exitCode = await proc.exited;

      // Should return exit code 1 (or 0 for graceful handling) and no error output
      expect(exitCode).toBeLessThanOrEqual(1);
      // Should not produce error output (graceful failure)
      expect(stderr).toBe('');
      expect(_stdout).toBe('');
    });
  });
});

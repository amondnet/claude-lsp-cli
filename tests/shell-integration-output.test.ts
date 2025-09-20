import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { spawn } from 'child_process';
import { writeFileSync, rmSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('Shell Integration Output', () => {
  let tempDir: string;

  beforeEach(() => {
    // Create temp directory for test files
    tempDir = join(tmpdir(), `lsp-test-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    // Clean up temp directory
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  test('should output shell integration format for errors', async () => {
    // Create a TypeScript file with errors
    const testFile = join(tempDir, 'test-error.ts');
    writeFileSync(
      testFile,
      `
      const x: string = 123; // Type error
      console.log(unknownVariable); // Unknown variable
      `
    );

    // Run the CLI check command
    const result = await new Promise<{ stdout: string; stderr: string; code: number }>(
      (resolve) => {
        const proc = spawn('bun', ['run', 'src/cli.ts', 'check', testFile], {
          cwd: process.cwd(),
        });

        let stdout = '';
        let stderr = '';

        proc.stdout.on('data', (data) => {
          stdout += data.toString();
        });

        proc.stderr.on('data', (data) => {
          stderr += data.toString();
        });

        proc.on('close', (code) => {
          resolve({ stdout, stderr, code: code || 0 });
        });
      }
    );

    // Check for OSC 633 sequences in stderr
    expect(result.stderr).toContain('\x1b]633;A\x07'); // Start sequence
    expect(result.stderr).toContain('\x1b]633;B\x07'); // Prompt end
    expect(result.stderr).toContain('\x1b]633;C\x07'); // Pre-execution
    expect(result.stderr).toContain('\x1b]633;E;'); // Command metadata
    expect(result.stderr).toContain('\x1b]633;D;1\x07'); // Exit code 1 (errors)

    // Check for clean summary in output (not the JSON format)
    expect(result.stderr).toContain('✗');
    expect(result.stderr).toContain('error');
  });

  test('should be silent for files with no errors', async () => {
    // Create a valid TypeScript file
    const testFile = join(tempDir, 'test-valid.ts');
    writeFileSync(
      testFile,
      `
      const x: string = "hello";
      console.log(x);
      `
    );

    // Run the CLI check command
    const result = await new Promise<{ stdout: string; stderr: string; code: number }>(
      (resolve) => {
        const proc = spawn('bun', ['run', 'src/cli.ts', 'check', testFile], {
          cwd: process.cwd(),
        });

        let stdout = '';
        let stderr = '';

        proc.stdout.on('data', (data) => {
          stdout += data.toString();
        });

        proc.stderr.on('data', (data) => {
          stderr += data.toString();
        });

        proc.on('close', (code) => {
          resolve({ stdout, stderr, code: code || 0 });
        });
      }
    );

    // Should show "No issues found" for check command when no errors
    expect(result.stderr).toContain('claude-lsp-cli diagnostics: No issues found');
    expect(result.stderr).toContain('\x1b]633;D;0\x07'); // Exit code 0
    expect(result.stdout).toBe('');
    expect(result.code).toBe(0);

    // Should NOT have error indicators when no errors
    expect(result.stderr).not.toContain('✗');
    expect(result.stderr).not.toContain('error found');
  });

  test('should handle PostToolUse hook with new format', async () => {
    // Create a TypeScript file with errors
    const testFile = join(tempDir, 'test-hook.ts');
    writeFileSync(
      testFile,
      `
      function broken(): void {
        return 123; // Type error - returning number from void function
      }
      `
    );

    // Create hook data
    const hookData = JSON.stringify({
      tool_input: {
        file_path: testFile,
      },
      cwd: tempDir,
    });

    // Run the hook command
    const result = await new Promise<{ stdout: string; stderr: string; code: number }>(
      (resolve) => {
        const proc = spawn('bun', ['run', 'src/cli.ts', 'hook', 'PostToolUse'], {
          cwd: process.cwd(),
        });

        let stdout = '';
        let stderr = '';

        proc.stdout.on('data', (data) => {
          stdout += data.toString();
        });

        proc.stderr.on('data', (data) => {
          stderr += data.toString();
        });

        // Send hook data to stdin
        proc.stdin.write(hookData);
        proc.stdin.end();

        proc.on('close', (code) => {
          resolve({ stdout, stderr, code: code || 0 });
        });
      }
    );

    // Check for shell integration format
    expect(result.stderr).toContain('\x1b]633;E;'); // Command metadata with diagnostics
    expect(result.stderr).toContain('✗'); // Clean summary
    expect(result.stderr).toContain('1 error');
    expect(result.code).toBe(2); // Hook exits with 2 on errors
  });
});

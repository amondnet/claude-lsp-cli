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

    // Check for the new format with summary and details
    expect(result.stderr).toContain('✗ 2 errors found');
    expect(result.stderr).toContain('test-error.ts:2:13');
    expect(result.stderr).toContain('test-error.ts:3:19');
    expect(result.stderr).toContain("Type 'number' is not assignable to type 'string'");
    expect(result.code).toBe(1);
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

    // Check command shows "No issues found" when no errors
    expect(result.stderr).toContain('No issues found');
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

    // Check for the new format with summary and details
    expect(result.stderr).toContain('✗ 1 error found');
    expect(result.stderr).toContain('test-hook.ts:3:9');
    expect(result.stderr).toContain("Type 'number' is not assignable to type 'void'");
    expect(result.code).toBe(2); // Hook exits with 2 on errors
  });
});

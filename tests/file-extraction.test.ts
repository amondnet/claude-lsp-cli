import { describe, test, expect, beforeEach, afterAll } from 'bun:test';
import { spawn } from 'bun';
import { writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';

const TEST_DIR = '/tmp/claude-lsp-extraction-test';
const CLI_PATH = './bin/claude-lsp-cli';

describe('File Path Extraction', () => {
  beforeEach(() => {
    mkdirSync(TEST_DIR, { recursive: true });
  });

  afterAll(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  describe('Extract from tool_input', () => {
    test('should extract from Edit tool_input.file_path', async () => {
      const testFile = join(TEST_DIR, 'edit-test.ts');
      writeFileSync(testFile, `const x: string = 42;`);

      const proc = spawn([CLI_PATH, 'hook', 'PostToolUse'], {
        stdin: 'pipe',
        stderr: 'pipe',
      });

      proc.stdin.write(
        JSON.stringify({
          tool_name: 'Edit',
          tool_input: { file_path: testFile },
          cwd: TEST_DIR,
        })
      );
      await proc.stdin.end();

      const stderr = await new Response(proc.stderr).text();
      const exitCode = await proc.exited;

      // Should extract and check the file
      expect(exitCode).toBe(2); // Has errors
      expect(stderr).toContain('[[system-message]]');
      expect(stderr).toContain('edit-test.ts');
    });

    test('should extract from Write tool_input.file_path', async () => {
      const testFile = join(TEST_DIR, 'write-test.py');
      writeFileSync(testFile, `x: str = 123`);

      const proc = spawn([CLI_PATH, 'hook', 'PostToolUse'], {
        stdin: 'pipe',
        stderr: 'pipe',
      });

      proc.stdin.write(
        JSON.stringify({
          tool_name: 'Write',
          tool_input: { file_path: testFile },
          cwd: TEST_DIR,
        })
      );
      await proc.stdin.end();

      const stderr = await new Response(proc.stderr).text();
      const exitCode = await proc.exited;

      // Should extract and check the file
      expect(exitCode).toBe(2); // Has errors
      expect(stderr).toContain('write-test.py');
    });

    test('should extract from Read tool_input.file_path', async () => {
      const testFile = join(TEST_DIR, 'read-test.go');
      writeFileSync(testFile, `package main\nfunc main() { var x string = 42 }`);

      const proc = spawn([CLI_PATH, 'hook', 'PostToolUse'], {
        stdin: 'pipe',
        stderr: 'pipe',
      });

      proc.stdin.write(
        JSON.stringify({
          tool_name: 'Read',
          tool_input: { file_path: testFile },
          cwd: TEST_DIR,
        })
      );
      await proc.stdin.end();

      const stderr = await new Response(proc.stderr).text();
      const exitCode = await proc.exited;

      // Should extract and check the file
      expect(exitCode).toBe(2); // Has errors
      expect(stderr).toContain('read-test.go');
    });
  });

  describe('Extract from Bash output', () => {
    test('should extract file path from Bash output', async () => {
      const testFile = join(TEST_DIR, 'bash-output.ts');
      writeFileSync(testFile, `const x: string = 42;`);

      const proc = spawn([CLI_PATH, 'hook', 'PostToolUse'], {
        stdin: 'pipe',
        stderr: 'pipe',
      });

      proc.stdin.write(
        JSON.stringify({
          tool_name: 'Bash',
          tool_response: {
            output: `Successfully wrote ${testFile}\nCreated file at ${testFile}`,
          },
          cwd: TEST_DIR,
        })
      );
      await proc.stdin.end();

      const stderr = await new Response(proc.stderr).text();
      const exitCode = await proc.exited;

      // Should extract file from Bash output
      expect(exitCode).toBe(2); // Has errors
      expect(stderr).toContain('bash-output.ts');
    });

    test('should extract multiple files from Bash output', async () => {
      const file1 = join(TEST_DIR, 'file1.ts');
      const file2 = join(TEST_DIR, 'file2.py');
      writeFileSync(file1, `const x: string = 42;`);
      writeFileSync(file2, `x: str = 123`);

      const proc = spawn([CLI_PATH, 'hook', 'PostToolUse'], {
        stdin: 'pipe',
        stderr: 'pipe',
      });

      proc.stdin.write(
        JSON.stringify({
          tool_name: 'Bash',
          tool_response: {
            output: `Processed files:\n${file1}\n${file2}`,
          },
          cwd: TEST_DIR,
        })
      );
      await proc.stdin.end();

      const stderr = await new Response(proc.stderr).text();
      const exitCode = await proc.exited;

      // Should extract and check both files
      expect(exitCode).toBe(2); // Has errors
      expect(stderr).toContain('file1.ts');
      expect(stderr).toContain('file2.py');
    });

    test('should extract files from ls output', async () => {
      const testFile = join(TEST_DIR, 'listed.rs');
      writeFileSync(testFile, `fn main() { let x: String = 42; }`);

      const proc = spawn([CLI_PATH, 'hook', 'PostToolUse'], {
        stdin: 'pipe',
        stderr: 'pipe',
      });

      proc.stdin.write(
        JSON.stringify({
          tool_name: 'Bash',
          tool_response: {
            output: `listed.rs\nREADME.md\npackage.json`,
          },
          cwd: TEST_DIR,
        })
      );
      await proc.stdin.end();

      const stderr = await new Response(proc.stderr).text();
      const exitCode = await proc.exited;

      // Should extract only source files, not README or package.json
      expect(exitCode).toBe(2); // Has errors
      expect(stderr).toContain('listed.rs');
      expect(stderr).not.toContain('README.md');
      expect(stderr).not.toContain('package.json');
    });
  });

  describe('Extract from Bash command', () => {
    test('should extract from Bash command when no output', async () => {
      const testFile = join(TEST_DIR, 'command.php');
      writeFileSync(testFile, `<?php\n$x = ; // syntax error`);

      const proc = spawn([CLI_PATH, 'hook', 'PostToolUse'], {
        stdin: 'pipe',
        stderr: 'pipe',
      });

      proc.stdin.write(
        JSON.stringify({
          tool_name: 'Bash',
          tool_input: {
            command: `cat ${testFile}`,
          },
          tool_response: {
            output: '', // Empty output, should fall back to command
          },
          cwd: TEST_DIR,
        })
      );
      await proc.stdin.end();

      const stderr = await new Response(proc.stderr).text();
      const exitCode = await proc.exited;

      // Should extract from command when output is empty
      expect(exitCode).toBe(2); // Has errors
      expect(stderr).toContain('command.php');
    });
  });

  describe('MultiEdit handling', () => {
    test('should extract file path from MultiEdit', async () => {
      const testFile = join(TEST_DIR, 'multiedit.ts');
      writeFileSync(testFile, `const x: string = 42;`);

      const proc = spawn([CLI_PATH, 'hook', 'PostToolUse'], {
        stdin: 'pipe',
        stderr: 'pipe',
      });

      proc.stdin.write(
        JSON.stringify({
          tool_name: 'MultiEdit',
          tool_input: {
            file_path: testFile,
            edits: [{ old_string: '42', new_string: '"hello"' }],
          },
          cwd: TEST_DIR,
        })
      );
      await proc.stdin.end();

      const stderr = await new Response(proc.stderr).text();
      const exitCode = await proc.exited;

      // Should extract and check the file from MultiEdit
      expect(exitCode).toBe(2); // Has errors
      expect(stderr).toContain('multiedit.ts');
    });
  });

  describe('Multiple file extraction', () => {
    test('should extract and check multiple files from Bash output', async () => {
      // Use unique file names to avoid deduplication issues
      const timestamp = Date.now();
      const file1 = join(TEST_DIR, `multi-${timestamp}-1.ts`);
      const file2 = join(TEST_DIR, `multi-${timestamp}-2.py`);
      const file3 = join(TEST_DIR, `multi-${timestamp}-3.go`);

      writeFileSync(file1, `const x: string = 42;`);
      writeFileSync(file2, `x: str = 123`);
      writeFileSync(file3, `package main\nfunc main() { var x string = 42 }`);

      const proc = spawn([CLI_PATH, 'hook', 'PostToolUse'], {
        stdin: 'pipe',
        stderr: 'pipe',
        env: { ...process.env, DEBUG_EXTRACTION: 'true' },
      });

      proc.stdin.write(
        JSON.stringify({
          tool_name: 'Bash',
          tool_response: {
            output: `Processing ${file1} ${file2} ${file3}`,
          },
          cwd: TEST_DIR,
        })
      );
      await proc.stdin.end();

      const stderr = await new Response(proc.stderr).text();
      const exitCode = await proc.exited;

      // Should check all files extracted from Bash output
      expect(exitCode).toBe(2); // Has errors
      if (stderr.includes('[[system-message]]')) {
        // Extract just the JSON part
        const match = stderr.match(/\[\[system-message\]\]:(.+)/);
        if (match) {
          const json = JSON.parse(match[1]);
          const files = json.diagnostics.map((d: any) => d.file);
          // Check that all three file types are present
          const hasTs = files.some((f: string) => f.endsWith('.ts'));
          const hasPy = files.some((f: string) => f.endsWith('.py'));
          const hasGo = files.some((f: string) => f.endsWith('.go'));
          expect(hasTs).toBe(true);
          expect(hasPy).toBe(true);
          expect(hasGo).toBe(true);
        }
      }
    });
  });

  describe('Ignore non-source files', () => {
    test('should not check README, JSON, config files', async () => {
      const proc = spawn([CLI_PATH, 'hook', 'PostToolUse'], {
        stdin: 'pipe',
        stderr: 'pipe',
      });

      proc.stdin.write(
        JSON.stringify({
          tool_name: 'Bash',
          tool_response: {
            output: 'Created README.md, package.json, .env, tsconfig.json',
          },
          cwd: TEST_DIR,
        })
      );
      await proc.stdin.end();

      const stderr = await new Response(proc.stderr).text();
      const exitCode = await proc.exited;

      // Should not check non-source files
      expect(exitCode).toBe(0); // No files to check
      expect(stderr).toBe('');
    });
  });
});

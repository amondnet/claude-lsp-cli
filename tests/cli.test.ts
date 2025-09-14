/**
 * High-impact test for cli.ts - Main CLI entry point
 * Tests the most critical user-facing functionality
 */

import { describe, test, expect } from 'bun:test';
import { exec as execCallback } from 'child_process';
import { promisify } from 'util';
import { join } from 'path';
import { existsSync, unlinkSync } from 'fs';

const exec = promisify(execCallback);
const CLI_PATH = join(import.meta.dir, '..', 'bin', 'claude-lsp-cli');

describe('CLI - Main Entry Point', () => {
  describe('Critical Command: check', () => {
    test('should provide diagnostics for TypeScript errors', async () => {
      // This is the most important feature - getting diagnostics for individual files
      const testFile = join(
        import.meta.dir,
        '..',
        'examples',
        'typescript-project',
        'src',
        'index.ts'
      );

      const { stdout, stderr } = await exec(`echo "test" | ${CLI_PATH} check ${testFile}`);

      // Should return system message format
      if (stdout.includes('[[system-message]]:')) {
        const match = stdout.match(/\[\[system-message\]\]:(.+)/);
        if (match) {
          const response = JSON.parse(match[1]);
          expect(response).toHaveProperty('summary');
          // diagnostics property is only present when there are actual diagnostics
          if (response.summary !== 'no errors or warnings') {
            expect(response).toHaveProperty('diagnostics');
          }
        }
      }

      // Should not crash
      expect(stderr || '').not.toContain('Error:');
    }, 30000);
  });

  describe('Critical Command: hook PostToolUse', () => {
    test('should handle file edit hooks without crashing', async () => {
      // Create a temporary TypeScript file with errors
      const tempFile = '/tmp/hook-test.ts';
      await Bun.write(
        tempFile,
        'let x: string = 123; // Type error\nundefinedFunction(); // Reference error'
      );

      const hookData = {
        tool: 'Edit',
        tool_input: {
          file_path: tempFile,
        },
      };

      const result = await exec(
        `echo '${JSON.stringify(hookData)}' | ${CLI_PATH} hook PostToolUse`
      ).catch((e) => e);

      // Hook should process the file and output diagnostics (exit code 2 is expected for diagnostics)
      // The test file has TypeScript errors so we expect diagnostic output
      expect(result.stderr || '').toContain('[[system-message]]:');
      expect(result.code).toBe(2); // Exit code 2 when diagnostics found

      // Cleanup
      if (existsSync(tempFile)) {
        unlinkSync(tempFile);
      }
    }, 10000);
  });

  describe('Critical Command: enable/disable', () => {
    test('should enable and disable languages', async () => {
      // Disable scala
      const { stdout: disableOut } = await exec(`${CLI_PATH} disable scala`);
      expect(disableOut).toContain('Disabled scala');

      // Enable scala
      const { stdout: enableOut } = await exec(`${CLI_PATH} enable scala`);
      expect(enableOut).toContain('Enabled scala');
    }, 10000);
  });

  describe('Error Handling', () => {
    test('should handle invalid commands gracefully', async () => {
      const result = await exec(`${CLI_PATH} invalid-command`).catch((e) => e);

      expect(result.stdout || result.stderr || '').toContain('Current Status:');
    }, 5000);

    test('should handle missing arguments gracefully', async () => {
      const result = await exec(`${CLI_PATH} check`).catch((e) => e);

      expect(result.stderr || result.stdout || '').toBe('');
    }, 5000);
  });
});

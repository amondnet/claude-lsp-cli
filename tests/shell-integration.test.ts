import { describe, test, expect, beforeEach, jest } from 'bun:test';
import {
  formatShellIntegrationOutput,
  writeShellIntegrationOutput,
  type ShellDiagnostic,
} from '../src/shell-integration';

describe('Shell Integration', () => {
  describe('formatShellIntegrationOutput', () => {
    test('should return silent output for no diagnostics', () => {
      const result = formatShellIntegrationOutput([]);

      expect(result.commandMetadata).toBe('claude-lsp-cli diagnostics: No issues found');
      expect(result.visibleOutput).toBe('');
      expect(result.exitCode).toBe(0);
    });

    test('should format single error correctly', () => {
      const diagnostics: ShellDiagnostic[] = [
        {
          file: 'src/main.ts',
          line: 15,
          column: 3,
          severity: 'error',
          message: "Cannot find name 'document'",
          code: 'TS2304',
        },
      ];

      const result = formatShellIntegrationOutput(diagnostics);

      expect(result.commandMetadata).toContain(
        "✗ src/main.ts:15:3 - TS2304: Cannot find name 'document'"
      );
      expect(result.visibleOutput).toBe('✗ 1 error found\n  Files affected: src/main.ts');
      expect(result.exitCode).toBe(1);
    });

    test('should format multiple errors and warnings', () => {
      const diagnostics: ShellDiagnostic[] = [
        {
          file: 'src/main.ts',
          line: 15,
          column: 3,
          severity: 'error',
          message: "Cannot find name 'document'",
          code: 'TS2304',
        },
        {
          file: 'src/main.ts',
          line: 22,
          column: 1,
          severity: 'error',
          message: "Property 'foo' does not exist",
          code: 'TS2339',
        },
        {
          file: 'src/utils.ts',
          line: 8,
          column: 12,
          severity: 'warning',
          message: "Variable 'token' is assigned but never used",
        },
      ];

      const result = formatShellIntegrationOutput(diagnostics);

      expect(result.commandMetadata).toContain('✗ src/main.ts:15:3');
      expect(result.commandMetadata).toContain('✗ src/main.ts:22:1');
      expect(result.commandMetadata).toContain('⚠ src/utils.ts:8:12');
      expect(result.visibleOutput).toBe(
        '✗ 2 errors, 1 warning found\n  Files affected: src/main.ts, src/utils.ts'
      );
      expect(result.exitCode).toBe(1);
    });

    test('should handle diagnostics without code', () => {
      const diagnostics: ShellDiagnostic[] = [
        {
          file: 'src/test.py',
          line: 10,
          column: 5,
          severity: 'error',
          message: 'Undefined variable',
        },
      ];

      const result = formatShellIntegrationOutput(diagnostics);

      expect(result.commandMetadata).toContain('✗ src/test.py:10:5 - Undefined variable');
      expect(result.commandMetadata).not.toContain('undefined:');
    });

    test('should handle only warnings', () => {
      const diagnostics: ShellDiagnostic[] = [
        {
          file: 'src/hooks.ts',
          line: 5,
          column: 1,
          severity: 'warning',
          message: "Unused import 'useEffect'",
        },
        {
          file: 'src/api.ts',
          line: 12,
          column: 8,
          severity: 'warning',
          message: "Variable 'token' is assigned but never used",
        },
      ];

      const result = formatShellIntegrationOutput(diagnostics);

      expect(result.visibleOutput).toBe(
        '✗ 2 warnings found\n  Files affected: src/hooks.ts, src/api.ts'
      );
      expect(result.exitCode).toBe(1);
    });

    test('should limit detailed diagnostics to 5 items', () => {
      const diagnostics: ShellDiagnostic[] = Array.from({ length: 10 }, (_, i) => ({
        file: `src/file${i}.ts`,
        line: i + 1,
        column: 1,
        severity: 'error' as const,
        message: `Error ${i + 1}`,
        code: `E${i + 1}`,
      }));

      const result = formatShellIntegrationOutput(diagnostics);

      // Check command metadata only has first 5 items
      const metadataLines = result.commandMetadata.split('\n');
      expect(metadataLines).toHaveLength(6); // '>' + 5 diagnostic lines

      // Verify first line is '>'
      expect(metadataLines[0]).toBe('>');

      // Verify each of the first 5 diagnostics is included
      for (let i = 0; i < 5; i++) {
        expect(metadataLines[i + 1]).toContain(`✗ src/file${i}.ts:${i + 1}:1`);
        expect(metadataLines[i + 1]).toContain(`E${i + 1}: Error ${i + 1}`);
      }

      // Visible output should still show total count
      expect(result.visibleOutput).toContain('10 errors found');
    });

    test('should handle very long file paths', () => {
      const longPath =
        'src/components/features/authentication/providers/oauth/google/' +
        'handlers/callback/validation/token/refresh.ts';
      const diagnostics: ShellDiagnostic[] = [
        {
          file: longPath,
          line: 100,
          column: 15,
          severity: 'error',
          message: 'Token expired',
          code: 'AUTH001',
        },
      ];

      const result = formatShellIntegrationOutput(diagnostics);

      expect(result.commandMetadata).toContain(longPath);
      expect(result.visibleOutput).toContain(longPath);
    });

    test('should handle diagnostics with special characters in messages', () => {
      const diagnostics: ShellDiagnostic[] = [
        {
          file: 'src/parser.ts',
          line: 42,
          column: 8,
          severity: 'error',
          message: "Unexpected token '<', expected '>' or '>='",
          code: 'PARSE_ERROR',
        },
      ];

      const result = formatShellIntegrationOutput(diagnostics);

      expect(result.commandMetadata).toContain("Unexpected token '<', expected '>' or '>='");
    });

    test('should handle mixed severity with proper pluralization', () => {
      const testCases: Array<{ errors: number; warnings: number; expected: string }> = [
        { errors: 0, warnings: 1, expected: '✗ 1 warning found' },
        { errors: 1, warnings: 0, expected: '✗ 1 error found' },
        { errors: 1, warnings: 1, expected: '✗ 1 error, 1 warning found' },
        { errors: 2, warnings: 1, expected: '✗ 2 errors, 1 warning found' },
        { errors: 1, warnings: 2, expected: '✗ 1 error, 2 warnings found' },
        { errors: 10, warnings: 5, expected: '✗ 10 errors, 5 warnings found' },
      ];

      for (const { errors, warnings, expected } of testCases) {
        const diagnostics: ShellDiagnostic[] = [];

        for (let i = 0; i < errors; i++) {
          diagnostics.push({
            file: 'test.ts',
            line: i + 1,
            column: 1,
            severity: 'error',
            message: `Error ${i + 1}`,
          });
        }

        for (let i = 0; i < warnings; i++) {
          diagnostics.push({
            file: 'test.ts',
            line: errors + i + 1,
            column: 1,
            severity: 'warning',
            message: `Warning ${i + 1}`,
          });
        }

        const result = formatShellIntegrationOutput(diagnostics);
        expect(result.visibleOutput.split('\n')[0]).toBe(expected);
      }
    });

    test('should deduplicate file names in affected files list', () => {
      const diagnostics: ShellDiagnostic[] = [
        {
          file: 'src/main.ts',
          line: 1,
          column: 1,
          severity: 'error',
          message: 'Error 1',
        },
        {
          file: 'src/main.ts',
          line: 2,
          column: 1,
          severity: 'error',
          message: 'Error 2',
        },
        {
          file: 'src/utils.ts',
          line: 1,
          column: 1,
          severity: 'warning',
          message: 'Warning 1',
        },
        {
          file: 'src/main.ts',
          line: 3,
          column: 1,
          severity: 'warning',
          message: 'Warning 2',
        },
      ];

      const result = formatShellIntegrationOutput(diagnostics);

      // Should only list each file once
      expect(result.visibleOutput).toBe(
        '✗ 2 errors, 2 warnings found\n  Files affected: src/main.ts, src/utils.ts'
      );
    });

    test('should handle empty message gracefully', () => {
      const diagnostics: ShellDiagnostic[] = [
        {
          file: 'src/test.ts',
          line: 1,
          column: 1,
          severity: 'error',
          message: '',
        },
      ];

      const result = formatShellIntegrationOutput(diagnostics);

      expect(result.commandMetadata).toContain('✗ src/test.ts:1:1 - ');
      expect(result.exitCode).toBe(1);
    });

    test('should handle zero line/column values', () => {
      const diagnostics: ShellDiagnostic[] = [
        {
          file: 'src/test.ts',
          line: 0,
          column: 0,
          severity: 'error',
          message: 'General file error',
        },
      ];

      const result = formatShellIntegrationOutput(diagnostics);

      expect(result.commandMetadata).toContain('✗ src/test.ts:0:0 - General file error');
    });
  });

  describe('writeShellIntegrationOutput', () => {
    beforeEach(() => {
      // Mock process.stderr.write and console.error
      jest.clearAllMocks();
    });

    test('should write correct sequences for errors', () => {
      const mockWrite = jest.fn();
      const mockError = jest.fn();

      // @ts-ignore - mocking for test
      process.stderr.write = mockWrite;
      // @ts-ignore - mocking for test
      console.error = mockError;

      const output = {
        commandMetadata: '>\n✗ test.ts:1:1 - Error',
        visibleOutput: '✗ 1 error found',
        exitCode: 1,
      };

      writeShellIntegrationOutput(output);

      // Check OSC 633 sequences
      expect(mockWrite).toHaveBeenCalledWith('\x1b]633;A\x07');
      expect(mockWrite).toHaveBeenCalledWith('\x1b]633;B\x07');
      expect(mockWrite).toHaveBeenCalledWith('\x1b]633;C\x07');
      expect(mockWrite).toHaveBeenCalledWith('\x1b]633;E;>\n✗ test.ts:1:1 - Error\x07\n');
      expect(mockWrite).toHaveBeenCalledWith('\x1b]633;D;1\x07');

      // Check visible output
      expect(mockError).toHaveBeenCalledWith('✗ 1 error found');
    });

    test('should write correct sequences for no errors', () => {
      const mockWrite = jest.fn();
      const mockError = jest.fn();

      // @ts-ignore - mocking for test
      process.stderr.write = mockWrite;
      // @ts-ignore - mocking for test
      console.error = mockError;

      const output = {
        commandMetadata: 'claude-lsp-cli diagnostics: No issues found',
        visibleOutput: '',
        exitCode: 0,
      };

      writeShellIntegrationOutput(output);

      // Check OSC 633 sequences
      expect(mockWrite).toHaveBeenCalledWith('\x1b]633;A\x07');
      expect(mockWrite).toHaveBeenCalledWith('\x1b]633;B\x07');
      expect(mockWrite).toHaveBeenCalledWith('\x1b]633;C\x07');
      expect(mockWrite).toHaveBeenCalledWith(
        '\x1b]633;E;claude-lsp-cli diagnostics: No issues found\x07\n'
      );
      expect(mockWrite).toHaveBeenCalledWith('\x1b]633;D;0\x07');

      // Check no visible output for clean case
      expect(mockError).not.toHaveBeenCalled();
    });

    test('should handle multiple errors with correct sequence formatting', () => {
      const mockWrite = jest.fn();
      const mockError = jest.fn();

      // @ts-ignore - mocking for test
      process.stderr.write = mockWrite;
      // @ts-ignore - mocking for test
      console.error = mockError;

      const output = {
        commandMetadata: '>\n✗ file1.ts:1:1 - Error 1\n✗ file2.ts:2:2 - Error 2',
        visibleOutput: '✗ 2 errors found\n  Files affected: file1.ts, file2.ts',
        exitCode: 1,
      };

      writeShellIntegrationOutput(output);

      // Verify all sequences are called in correct order
      const calls = mockWrite.mock.calls;
      expect(calls[0]?.[0]).toBe('\x1b]633;A\x07'); // Start
      expect(calls[1]?.[0]).toBe('\x1b]633;B\x07'); // Prompt end
      expect(calls[2]?.[0]).toBe('\x1b]633;C\x07'); // Pre-execution
      expect(calls[3]?.[0]).toBe(
        '\x1b]633;E;>\n✗ file1.ts:1:1 - Error 1\n✗ file2.ts:2:2 - Error 2\x07\n'
      ); // Metadata with newlines preserved
      expect(calls[4]?.[0]).toBe('\x1b]633;D;1\x07'); // Exit code

      expect(mockError).toHaveBeenCalledWith(
        '✗ 2 errors found\n  Files affected: file1.ts, file2.ts'
      );
    });

    test('should handle warnings with exitCode 1', () => {
      const mockWrite = jest.fn();
      const mockError = jest.fn();

      // @ts-ignore - mocking for test
      process.stderr.write = mockWrite;
      // @ts-ignore - mocking for test
      console.error = mockError;

      const output = {
        commandMetadata: '>\n⚠ test.ts:5:10 - Unused variable',
        visibleOutput: '✗ 1 warning found',
        exitCode: 1,
      };

      writeShellIntegrationOutput(output);

      // Check exit code is 1 for warnings
      expect(mockWrite).toHaveBeenCalledWith('\x1b]633;D;1\x07');
      expect(mockError).toHaveBeenCalledWith('✗ 1 warning found');
    });

    test('should handle special characters in metadata', () => {
      const mockWrite = jest.fn();
      const mockError = jest.fn();

      // @ts-ignore - mocking for test
      process.stderr.write = mockWrite;
      // @ts-ignore - mocking for test
      console.error = mockError;

      const output = {
        commandMetadata: ">\n✗ test.ts:1:1 - Expected '>' but got '<='",
        visibleOutput: '✗ 1 error found',
        exitCode: 1,
      };

      writeShellIntegrationOutput(output);

      // Verify special characters are preserved in metadata
      expect(mockWrite).toHaveBeenCalledWith(
        "\x1b]633;E;>\n✗ test.ts:1:1 - Expected '>' but got '<='\x07\n"
      );
    });

    test('should not output visible text for exitCode 0', () => {
      const mockWrite = jest.fn();
      const mockError = jest.fn();

      // @ts-ignore - mocking for test
      process.stderr.write = mockWrite;
      // @ts-ignore - mocking for test
      console.error = mockError;

      const output = {
        commandMetadata: 'No issues',
        visibleOutput: 'This should not be shown',
        exitCode: 0,
      };

      writeShellIntegrationOutput(output);

      // Should not call console.error for exitCode 0
      expect(mockError).not.toHaveBeenCalled();

      // But should still write OSC sequences
      expect(mockWrite).toHaveBeenCalledWith('\x1b]633;D;0\x07');
    });
  });
});

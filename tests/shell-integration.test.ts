import { describe, test, expect, beforeEach, jest } from 'bun:test';
import {
  formatShellIntegrationOutput,
  writeShellIntegrationOutput,
  type ShellDiagnostic,
} from '../src/shell-integration';

describe('Shell Integration', () => {
  describe('formatShellIntegrationOutput', () => {
    test('should return silent output for no diagnostics in hook mode', () => {
      const result = formatShellIntegrationOutput([], true); // isHook=true

      expect(result.summary).toBe('');
      expect(result.exitCode).toBe(0);
    });

    test('should return "No issues found" for no diagnostics in check mode', () => {
      const result = formatShellIntegrationOutput([], false); // isHook=false (default)

      expect(result.summary).toBe('No issues found');
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

      expect(result.summary).toContain('✗ 1 error found');
      expect(result.summary).toContain('src/main.ts:15:3');
      expect(result.summary).toContain('[TS2304]');
      expect(result.summary).toContain("Cannot find name 'document'");
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

      expect(result.summary).toContain('✗ 2 errors, 1 warning found');
      expect(result.summary).toContain('src/main.ts:15:3');
      expect(result.summary).toContain('src/main.ts:22:1');
      expect(result.summary).toContain('src/utils.ts:8:12');
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

      expect(result.summary).toContain('✗ 1 error found');
      expect(result.summary).toContain('src/test.py:10:5');
      expect(result.summary).toContain('Undefined variable');
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

      expect(result.summary).toContain('✗ 2 warnings found');
      expect(result.summary).toContain('src/hooks.ts:5:1');
      expect(result.summary).toContain('src/api.ts:12:8');
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

      // Check summary has first 5 items plus "and X more"
      const summaryLines = result.summary.split('\n');
      // Should have: summary line + 5 detail lines + "and X more" line
      expect(summaryLines.length).toBeGreaterThanOrEqual(6);

      // Verify each of the first 5 diagnostics is included
      for (let i = 0; i < 5; i++) {
        expect(result.summary).toContain(`src/file${i}.ts:${i + 1}:1`);
      }

      // Summary should show total count and "more" indicator
      expect(result.summary).toContain('✗ 10 errors found');
      expect(result.summary).toContain('... and 5 more');
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

      expect(result.summary).toContain('✗ 1 error found');
      expect(result.summary).toContain(longPath);
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

      expect(result.summary).toContain("Unexpected token '<', expected '>' or '>='");
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
        expect(result.summary.split('\n')[0]).toBe(expected);
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

      // Should show summary and first 5 details
      expect(result.summary).toContain('✗ 2 errors, 2 warnings found');
      expect(result.summary).toContain('src/main.ts:1:1');
      expect(result.summary).toContain('src/main.ts:2:1');
      expect(result.summary).toContain('src/utils.ts:1:1');
      expect(result.summary).toContain('src/main.ts:3:1');
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

      expect(result.summary).toContain('✗ 1 error found');
      expect(result.summary).toContain('src/test.ts:1:1');
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

      expect(result.summary).toContain('✗ 1 error found');
      expect(result.summary).toContain('src/test.ts:0:0');
      expect(result.summary).toContain('General file error');
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
        summary: '✗ 1 error found\n  ✗ test.ts:1:1: Error',
        exitCode: 1,
      };

      writeShellIntegrationOutput(output);

      // Should write newline and summary to stderr
      expect(mockWrite).toHaveBeenCalledWith('\n');
      expect(mockWrite).toHaveBeenCalledWith('✗ 1 error found\n  ✗ test.ts:1:1: Error');
    });

    test('should write correct sequences for no errors', () => {
      const mockWrite = jest.fn();
      const mockError = jest.fn();

      // @ts-ignore - mocking for test
      process.stderr.write = mockWrite;
      // @ts-ignore - mocking for test
      console.error = mockError;

      const output = {
        summary: '',
        exitCode: 0,
      };

      writeShellIntegrationOutput(output);

      // Should not write anything when no errors
      expect(mockWrite).not.toHaveBeenCalled();
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
        summary: '✗ 2 errors found\n  ✗ file1.ts:1:1: Error 1\n  ✗ file2.ts:2:2: Error 2',
        exitCode: 1,
      };

      writeShellIntegrationOutput(output);

      // Should write newline and summary
      expect(mockWrite).toHaveBeenCalledWith('\n');
      expect(mockWrite).toHaveBeenCalledWith(
        '✗ 2 errors found\n  ✗ file1.ts:1:1: Error 1\n  ✗ file2.ts:2:2: Error 2'
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
        summary: '✗ 1 warning found\n  ⚠ test.ts:5:10: Unused variable',
        exitCode: 1,
      };

      writeShellIntegrationOutput(output);

      // Should write newline and summary with warning
      expect(mockWrite).toHaveBeenCalledWith('\n');
      expect(mockWrite).toHaveBeenCalledWith(
        '✗ 1 warning found\n  ⚠ test.ts:5:10: Unused variable'
      );
    });

    test('should handle special characters in metadata', () => {
      const mockWrite = jest.fn();
      const mockError = jest.fn();

      // @ts-ignore - mocking for test
      process.stderr.write = mockWrite;
      // @ts-ignore - mocking for test
      console.error = mockError;

      const output = {
        summary: "✗ 1 error found\n  ✗ test.ts:1:1: Expected '>' but got '<='",
        exitCode: 1,
      };

      writeShellIntegrationOutput(output);

      // Should write newline and summary with special characters
      expect(mockWrite).toHaveBeenCalledWith('\n');
      expect(mockWrite).toHaveBeenCalledWith(
        "✗ 1 error found\n  ✗ test.ts:1:1: Expected '>' but got '<='"
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
        summary: '',
        exitCode: 0,
      };

      writeShellIntegrationOutput(output);

      // Should not write anything when no errors
      expect(mockError).not.toHaveBeenCalled();
      expect(mockWrite).not.toHaveBeenCalled();
    });
  });
});

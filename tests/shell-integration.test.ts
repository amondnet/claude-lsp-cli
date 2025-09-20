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
  });
});

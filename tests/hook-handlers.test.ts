import { describe, test, expect, beforeEach, afterEach, spyOn } from 'bun:test';
import { handlePostToolUse } from '../src/cli/hooks/post-tool-use';
import * as fileChecker from '../src/file-checker';
import * as deduplication from '../src/cli/utils/deduplication';
import * as commonUtils from '../src/utils/common';
import { join } from 'path';

// Store original process.exit
const originalExit = process.exit;
let _exitCode: number | undefined;
void _exitCode;

// Helper to capture console output
let consoleOutput: string[] = [];
let consoleErrorOutput: string[] = [];
const originalConsoleLog = console.log;
const originalConsoleError = console.error;

// Helper to capture stderr output for shell integration
let stderrOutput: string[] = [];
const originalStderrWrite = process.stderr.write;

// Helper function to run async hook and capture exit
async function runHookAndCaptureExit(
  fn: Promise<void>
): Promise<{ exitCode?: number; errorMessage?: string }> {
  try {
    await fn;
    return { exitCode: undefined };
  } catch (error: any) {
    if (error.message && error.message.includes('process.exit')) {
      // Extract exit code from the error message
      const match = error.message.match(/process\.exit\((\d+)\)/);
      const code = match ? parseInt(match[1]) : (error.exitCode ?? 0);
      return { exitCode: code, errorMessage: error.message };
    }
    throw error;
  }
}

describe('Hook Handlers', () => {
  beforeEach(() => {
    // Mock process.exit to capture exit code
    _exitCode = undefined;
    process.exit = ((code?: number) => {
      _exitCode = code ?? 0;
      const error = new Error(`process.exit(${code ?? 0})`);
      (error as any).exitCode = code ?? 0;
      throw error;
    }) as any;

    // Capture console output
    consoleOutput = [];
    consoleErrorOutput = [];
    stderrOutput = [];
    console.log = ((...args: any[]) => {
      consoleOutput.push(
        args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ')
      );
    }) as any;
    console.error = ((...args: any[]) => {
      consoleErrorOutput.push(
        args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ')
      );
    }) as any;

    // Mock stderr.write to capture shell integration sequences
    process.stderr.write = ((chunk: any) => {
      stderrOutput.push(String(chunk));
      return true;
    }) as any;

    // Clear any mocks if needed
  });

  afterEach(() => {
    // Restore console methods
    console.log = originalConsoleLog;
    console.error = originalConsoleError;
    // Restore stderr.write
    process.stderr.write = originalStderrWrite;
    // Restore process.exit
    process.exit = originalExit;
  });

  describe('handlePostToolUse', () => {
    test('should exit gracefully with empty input', async () => {
      const result = await runHookAndCaptureExit(handlePostToolUse(''));
      expect(result.exitCode).toBe(0); // Empty input exits cleanly with 0
    });

    test('should exit gracefully with whitespace-only input', async () => {
      const result = await runHookAndCaptureExit(handlePostToolUse('   \n\t  '));
      expect(result.exitCode).toBe(0); // Whitespace input exits cleanly with 0
    });

    test('should exit gracefully with invalid JSON', async () => {
      const result = await runHookAndCaptureExit(handlePostToolUse('not json'));
      expect(result.exitCode).toBe(0); // Invalid JSON exits cleanly with 0
    });

    test('should exit gracefully when no files extracted', async () => {
      const hookData = {
        tool: 'SomeTool',
        cwd: '/test/dir',
      };
      const result = await runHookAndCaptureExit(handlePostToolUse(JSON.stringify(hookData)));
      expect(result.exitCode).toBe(0); // No files extracted exits cleanly with 0
    });

    test('should check file and report diagnostics', async () => {
      // Mock checkFile to return diagnostics
      const mockCheckFile = spyOn(fileChecker, 'checkFile');
      mockCheckFile.mockResolvedValue({
        file: 'test.ts',
        tool: 'tsc',
        diagnostics: [
          {
            severity: 'error' as const,
            message: 'Type error',
            line: 10,
            column: 5,
          },
        ],
      });

      // Mock deduplication functions
      const mockShouldShow = spyOn(deduplication, 'shouldShowResult');
      mockShouldShow.mockReturnValue(true);
      const _mockMarkShown = spyOn(deduplication, 'markResultShown');
      void _mockMarkShown;

      const hookData = {
        tool_input: {
          file_path: 'test.ts',
        },
        cwd: '/test/dir',
      };

      const result = await runHookAndCaptureExit(handlePostToolUse(JSON.stringify(hookData)));
      expect(result.exitCode).toBe(2); // Exit code 2 when diagnostics found

      expect(mockCheckFile).toHaveBeenCalledWith('/test/dir/test.ts');
      expect(mockShouldShow).toHaveBeenCalledWith('/test/dir/test.ts');
      expect(_mockMarkShown).toHaveBeenCalledWith('/test/dir/test.ts');

      // Check shell integration output format
      const fullStderr = stderrOutput.join('');
      expect(fullStderr).toContain('\x1b]633;A\x07'); // Start sequence
      expect(fullStderr).toContain('\x1b]633;E;'); // Command metadata
      expect(fullStderr).toContain('\x1b]633;D;1\x07'); // Exit code 1 for errors

      // Check visible summary in console.error
      const errorOutput = consoleErrorOutput.join(' ');
      expect(errorOutput).toContain('✗ 1 error found');
      expect(errorOutput).toContain('Files affected:');
    });

    test('should handle multiple files in parallel', async () => {
      const mockCheckFile = spyOn(fileChecker, 'checkFile');
      mockCheckFile.mockClear();
      mockCheckFile.mockImplementation(async (path: string) => {
        if (path.includes('test1.ts')) {
          return {
            file: 'test1.ts',
            tool: 'tsc',
            diagnostics: [
              {
                severity: 'error' as const,
                message: 'Error 1',
                line: 1,
                column: 1,
              },
            ],
          };
        } else if (path.includes('test2.py')) {
          return {
            file: 'test2.py',
            tool: 'python',
            diagnostics: [
              {
                severity: 'warning' as const,
                message: 'Warning 1',
                line: 2,
                column: 2,
              },
            ],
          };
        }
        return null;
      });

      const mockShouldShow = spyOn(deduplication, 'shouldShowResult');
      mockShouldShow.mockClear();
      mockShouldShow.mockReturnValue(true);
      const _mockMarkShown = spyOn(deduplication, 'markResultShown');
      void _mockMarkShown;
      _mockMarkShown.mockClear();

      const hookData = {
        tool_response: {
          output: 'Files modified: test1.ts and test2.py',
        },
      };

      const result = await runHookAndCaptureExit(handlePostToolUse(JSON.stringify(hookData)));
      expect(result.exitCode).toBe(2); // Exit code 2 when diagnostics found

      expect(mockCheckFile).toHaveBeenCalledTimes(2);

      // Check shell integration format
      const fullStderr = stderrOutput.join('');
      expect(fullStderr).toContain('\x1b]633;E;'); // Command metadata

      // Check visible summary
      const errorOutput = consoleErrorOutput.join(' ');
      expect(errorOutput).toContain('✗ 1 error, 1 warning found');
    });

    test('should skip files when checking is disabled', async () => {
      const mockCheckFile = spyOn(fileChecker, 'checkFile');
      mockCheckFile.mockResolvedValue(null); // null means checking disabled

      const hookData = {
        tool_input: {
          file_path: 'test.scala', // Scala might be disabled
        },
      };

      const result = await runHookAndCaptureExit(handlePostToolUse(JSON.stringify(hookData)));
      expect(result.exitCode).toBe(0); // Disabled language exits cleanly with 0
      expect(mockCheckFile).toHaveBeenCalled();

      // Should not output anything when disabled
      expect(consoleErrorOutput.length).toBe(0);
      expect(stderrOutput.length).toBe(0);
    });

    test('should respect deduplication and not show same results', async () => {
      const mockCheckFile = spyOn(fileChecker, 'checkFile');
      mockCheckFile.mockClear();
      mockCheckFile.mockResolvedValue({
        file: 'test.ts',
        tool: 'tsc',
        diagnostics: [
          {
            severity: 'error' as const,
            message: 'Same error',
            line: 1,
            column: 1,
          },
        ],
      });

      const mockShouldShow = spyOn(deduplication, 'shouldShowResult');
      mockShouldShow.mockClear();
      mockShouldShow.mockReturnValue(false); // Already shown
      const _mockMarkShown = spyOn(deduplication, 'markResultShown');
      void _mockMarkShown;
      _mockMarkShown.mockClear();

      const hookData = {
        tool_input: {
          file_path: 'test.ts',
        },
        cwd: process.cwd(), // Add cwd to avoid issues with path resolution
      };

      const result = await runHookAndCaptureExit(handlePostToolUse(JSON.stringify(hookData)));

      expect(result.exitCode).toBe(0); // Should exit 0 when duplicated results are suppressed

      expect(mockCheckFile).toHaveBeenCalled();
      expect(mockShouldShow).toHaveBeenCalled();
      expect(_mockMarkShown).not.toHaveBeenCalled(); // Should not mark if not shown
      // The "Hook processing failed" message comes from catching the mocked process.exit, not a real error
      // So we don't check for it here
    });

    test('should limit diagnostics to maximum 5 items', async () => {
      const mockCheckFile = spyOn(fileChecker, 'checkFile');
      const manyDiagnostics = Array.from({ length: 10 }, (_, i) => ({
        severity: 'error' as const,
        message: `Error ${i + 1}`,
        line: i + 1,
        column: 1,
      }));

      mockCheckFile.mockResolvedValue({
        file: 'test.ts',
        tool: 'tsc',
        diagnostics: manyDiagnostics,
      });

      const mockShouldShow = spyOn(deduplication, 'shouldShowResult');
      mockShouldShow.mockReturnValue(true);
      const _mockMarkShown = spyOn(deduplication, 'markResultShown');
      void _mockMarkShown;

      const hookData = {
        tool_input: {
          file_path: 'test.ts',
        },
      };

      const result = await runHookAndCaptureExit(handlePostToolUse(JSON.stringify(hookData)));
      expect(result.exitCode).toBe(2); // Exit code 2 when diagnostics found

      // Check shell integration format shows all errors in summary
      const fullStderr = stderrOutput.join('');
      expect(fullStderr).toContain('\x1b]633;E;'); // Command metadata contains all diagnostics

      const errorOutput = consoleErrorOutput.join(' ');
      expect(errorOutput).toContain('✗ 10 errors found'); // Summary shows all 10 errors
    });

    test('should handle errors gracefully', async () => {
      const mockCheckFile = spyOn(fileChecker, 'checkFile');
      mockCheckFile.mockRejectedValue(new Error('Check failed'));

      const hookData = {
        tool_input: {
          file_path: 'test.ts',
        },
      };

      const result = await runHookAndCaptureExit(handlePostToolUse(JSON.stringify(hookData)));
      expect(result.exitCode).toBe(1);
      expect(consoleErrorOutput.some((o) => o.includes('Hook processing failed'))).toBe(true);
    });

    test('should handle absolute paths correctly', async () => {
      const mockCheckFile = spyOn(fileChecker, 'checkFile');
      mockCheckFile.mockResolvedValue(null);

      const hookData = {
        tool_input: {
          file_path: '/absolute/path/test.ts',
        },
        cwd: '/different/dir',
      };

      const result = await runHookAndCaptureExit(handlePostToolUse(JSON.stringify(hookData)));
      expect(result.exitCode).toBe(0); // No diagnostics exits cleanly with 0
      expect(mockCheckFile).toHaveBeenCalledWith('/absolute/path/test.ts'); // Should use absolute path as-is
    });

    test('should filter to only show errors and warnings', async () => {
      const mockCheckFile = spyOn(fileChecker, 'checkFile');
      mockCheckFile.mockResolvedValue({
        file: 'test.ts',
        tool: 'tsc',
        diagnostics: [
          { severity: 'error' as const, message: 'Error', line: 1, column: 1 },
          { severity: 'warning' as const, message: 'Warning', line: 2, column: 1 },
          { severity: 'info' as const, message: 'Info', line: 3, column: 1 },
        ],
      });

      const mockShouldShow = spyOn(deduplication, 'shouldShowResult');
      mockShouldShow.mockReturnValue(true);
      const _mockMarkShown = spyOn(deduplication, 'markResultShown');
      void _mockMarkShown;

      const hookData = {
        tool_input: { file_path: 'test.ts' },
      };

      const result = await runHookAndCaptureExit(handlePostToolUse(JSON.stringify(hookData)));
      expect(result.exitCode).toBe(2); // Exit code 2 when diagnostics found

      // Check shell integration output in stderr
      const fullStderr = stderrOutput.join('');
      expect(fullStderr).toContain(']633;E;');
      expect(fullStderr).toContain('✗');

      // Count the number of error/warning lines (should be 2: error and warning)
      const errorLines = (fullStderr.match(/✗|⚠/g) || []).length;
      expect(errorLines).toBe(2);
    });

    test('should handle multiple files from different projects with separate project roots', async () => {
      const mockCheckFile = spyOn(fileChecker, 'checkFile');
      mockCheckFile.mockClear();
      mockCheckFile.mockImplementation(async (filePath: string) => {
        // Simulate diagnostics for files from different projects
        if (filePath.includes('/project1/')) {
          return {
            file: filePath,
            tool: 'tsc',
            diagnostics: [
              { severity: 'error' as const, message: 'Project1 error', line: 1, column: 1 },
            ],
          };
        } else if (filePath.includes('/project2/')) {
          return {
            file: filePath,
            tool: 'pyright',
            diagnostics: [
              { severity: 'warning' as const, message: 'Project2 warning', line: 2, column: 1 },
            ],
          };
        }
        return null;
      });

      // Track which project roots are detected
      const projectRootsUsed = new Set<string>();

      // Mock deduplication functions to track calls
      const mockShouldShow = spyOn(deduplication, 'shouldShowResult');
      mockShouldShow.mockImplementation((filePath: string) => {
        // Track project roots indirectly through file paths
        if (filePath.includes('/project1/')) projectRootsUsed.add('/home/user/project1');
        if (filePath.includes('/project2/')) projectRootsUsed.add('/home/user/project2');
        return true;
      });

      const mockMarkShown = spyOn(deduplication, 'markResultShown');
      mockMarkShown.mockImplementation(() => {});

      const hookData = {
        tool_response: {
          output: 'Modified files: /home/user/project1/src/main.ts and /home/user/project2/app.py',
        },
      };

      const result = await runHookAndCaptureExit(handlePostToolUse(JSON.stringify(hookData)));
      expect(result.exitCode).toBe(2); // Exit code 2 when diagnostics found

      // Verify both files were checked
      expect(mockCheckFile).toHaveBeenCalledTimes(2);
      expect(mockCheckFile).toHaveBeenCalledWith('/home/user/project1/src/main.ts');
      expect(mockCheckFile).toHaveBeenCalledWith('/home/user/project2/app.py');

      // Verify deduplication was called for each file
      expect(mockShouldShow).toHaveBeenCalledWith('/home/user/project1/src/main.ts');
      expect(mockShouldShow).toHaveBeenCalledWith('/home/user/project2/app.py');
      expect(mockMarkShown).toHaveBeenCalledWith('/home/user/project1/src/main.ts');
      expect(mockMarkShown).toHaveBeenCalledWith('/home/user/project2/app.py');

      // Verify that files from different projects were identified
      expect(projectRootsUsed.size).toBe(2);
      expect(projectRootsUsed.has('/home/user/project1')).toBe(true);
      expect(projectRootsUsed.has('/home/user/project2')).toBe(true);

      // Verify the output contains diagnostics from both projects in shell integration format
      const fullStderr = stderrOutput.join('');
      expect(fullStderr).toContain('Project1 error');
      expect(fullStderr).toContain('Project2 warning');

      // Check visible summary
      const consoleOutput = consoleErrorOutput.join('');
      expect(consoleOutput).toContain('1 error, 1 warning found');
    });

    test('should use separate deduplication state files for different projects', async () => {
      const mockCheckFile = spyOn(fileChecker, 'checkFile');
      mockCheckFile.mockClear();
      mockCheckFile.mockResolvedValue({
        file: 'test.ts',
        tool: 'tsc',
        diagnostics: [{ severity: 'error' as const, message: 'Error', line: 1, column: 1 }],
      });

      // Create a mock to spy on internal calls to findProjectRoot
      const mockFindProjectRoot = spyOn(commonUtils, 'findProjectRoot');
      mockFindProjectRoot.mockImplementation((filePath: string) => {
        if (filePath.includes('projectA')) return '/workspace/projectA';
        if (filePath.includes('projectB')) return '/workspace/projectB';
        return '/tmp';
      });

      const mockShouldShow = spyOn(deduplication, 'shouldShowResult');
      mockShouldShow.mockReturnValue(true);

      const mockMarkShown = spyOn(deduplication, 'markResultShown');
      mockMarkShown.mockImplementation(() => {});

      const hookData = {
        tool_response: {
          output: 'Files: /workspace/projectA/file.ts and /workspace/projectB/file.ts',
        },
      };

      await runHookAndCaptureExit(handlePostToolUse(JSON.stringify(hookData)));

      // Verify both files were processed
      expect(mockCheckFile).toHaveBeenCalledTimes(2);
      expect(mockCheckFile).toHaveBeenCalledWith('/workspace/projectA/file.ts');
      expect(mockCheckFile).toHaveBeenCalledWith('/workspace/projectB/file.ts');

      // Verify deduplication was called for each file (which internally uses different state files)
      expect(mockShouldShow).toHaveBeenCalledWith('/workspace/projectA/file.ts');
      expect(mockShouldShow).toHaveBeenCalledWith('/workspace/projectB/file.ts');
      expect(mockMarkShown).toHaveBeenCalledWith('/workspace/projectA/file.ts');
      expect(mockMarkShown).toHaveBeenCalledWith('/workspace/projectB/file.ts');
    });
  });

  describe('Integration with file extraction', () => {
    test('should extract files from various hook data structures', async () => {
      const mockCheckFile = spyOn(fileChecker, 'checkFile');
      mockCheckFile.mockClear();
      mockCheckFile.mockResolvedValue(null);

      const testCases = [
        {
          name: 'tool_input.file_path',
          data: { tool_input: { file_path: 'test.ts' } },
          expected: ['test.ts'],
        },
        {
          name: 'tool_response.filePath',
          data: { tool_response: { filePath: 'test.py' } },
          expected: ['test.py'],
        },
        {
          name: 'output in tool_response',
          data: { tool_response: { output: 'Modified _file: src/main.go' } },
          expected: ['src/main.go'],
        },
        {
          name: 'command in tool_input',
          data: { tool_input: { command: 'cat package.json test.rs' } },
          expected: ['test.rs'],
        },
        {
          name: 'multiple files',
          data: {
            tool_response: {
              output: 'Files modified: test1.ts and test2.py and test3.java',
            },
          },
          expected: ['test1.ts', 'test2.py', 'test3.java'],
        },
      ];

      for (let i = 0; i < testCases.length; i++) {
        const testCase = testCases[i];
        mockCheckFile.mockClear();

        if (!testCase) continue; // Skip if testCase is undefined

        const result = await runHookAndCaptureExit(
          handlePostToolUse(JSON.stringify(testCase.data))
        );
        expect(result.exitCode).toBe(0); // No diagnostics exits cleanly with 0

        expect(mockCheckFile).toHaveBeenCalledTimes(testCase.expected.length);

        // Verify each expected file was checked
        for (const file of testCase.expected) {
          const expectedPath = file.startsWith('/') ? file : join(process.cwd(), file);
          expect(mockCheckFile).toHaveBeenCalledWith(expectedPath);
        }
      }
    });
  });
});

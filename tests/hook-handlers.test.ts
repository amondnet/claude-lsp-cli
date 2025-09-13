import { describe, test, expect, beforeEach, afterEach, spyOn } from 'bun:test';
import { handlePostToolUse } from '../src/cli/hooks/post-tool-use';
import * as fileChecker from '../src/file-checker';
import * as deduplication from '../src/cli/utils/deduplication';
import { join } from 'path';

// Store original process.exit
const originalExit = process.exit;
let _exitCode: number | undefined;

// Helper to capture console output
let consoleOutput: string[] = [];
let consoleErrorOutput: string[] = [];
const originalConsoleLog = console.log;
const originalConsoleError = console.error;

// Helper function to run async hook and capture exit
async function runHookAndCaptureExit(fn: Promise<void>): Promise<{ exitCode?: number; errorMessage?: string }> {
  try {
    await fn;
    return { exitCode: undefined };
  } catch (error: any) {
    if (error.message && error.message.includes('process.exit')) {
      // Extract exit code from the error message
      const match = error.message.match(/process\.exit\((\d+)\)/);
      const code = match ? parseInt(match[1]) : error.exitCode ?? 0;
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
    console.log = ((...args: any[]) => {
      consoleOutput.push(args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' '));
    }) as any;
    console.error = ((...args: any[]) => {
      consoleErrorOutput.push(args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' '));
    }) as any;

    // Clear any mocks if needed
  });

  afterEach(() => {
    // Restore console methods
    console.log = originalConsoleLog;
    console.error = originalConsoleError;
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
        cwd: '/test/dir'
      };
      const result = await runHookAndCaptureExit(handlePostToolUse(JSON.stringify(hookData)));
      expect(result.exitCode).toBe(0); // No files extracted exits cleanly with 0
    });

    test('should check file and report diagnostics', async () => {
      // Mock checkFile to return diagnostics
      const mockCheckFile = spyOn(fileChecker, 'checkFile');
      mockCheckFile.mockResolvedValue({
        file: 'test.ts',
        tool: 'typescript',
        diagnostics: [
          {
            severity: 'error' as const,
            message: 'Type error',
            line: 10,
            column: 5
          }
        ]
      });

      // Mock deduplication functions
      const mockShouldShow = spyOn(deduplication, 'shouldShowResult');
      mockShouldShow.mockReturnValue(true);
      const _mockMarkShown = spyOn(deduplication, 'markResultShown');

      const hookData = {
        tool_input: {
          file_path: 'test.ts'
        },
        cwd: '/test/dir'
      };

      const result = await runHookAndCaptureExit(handlePostToolUse(JSON.stringify(hookData)));
      expect(result.exitCode).toBe(2); // Exit code 2 when diagnostics found
      
      expect(mockCheckFile).toHaveBeenCalledWith('/test/dir/test.ts');
      expect(mockShouldShow).toHaveBeenCalledWith('/test/dir/test.ts', 1);
      expect(_mockMarkShown).toHaveBeenCalledWith('/test/dir/test.ts', 1);
      
      // Check output format
      const errorOutput = consoleErrorOutput.find(o => o.includes('[[system-message]]'));
      expect(errorOutput).toBeDefined();
      expect(errorOutput).toContain('"summary":"1 error(s)"');
    });

    test('should handle multiple files in parallel', async () => {
      const mockCheckFile = spyOn(fileChecker, 'checkFile');
      mockCheckFile.mockClear();
      mockCheckFile.mockImplementation(async (path: string) => {
        if (path.includes('test1.ts')) {
          return {
            file: 'test1.ts',
            tool: 'typescript',
            diagnostics: [{
              severity: 'error' as const,
              message: 'Error 1',
              line: 1,
              column: 1
            }]
          };
        } else if (path.includes('test2.py')) {
          return {
            file: 'test2.py',
            tool: 'python',
            diagnostics: [{
              severity: 'warning' as const,
              message: 'Warning 1',
              line: 2,
              column: 2
            }]
          };
        }
        return null;
      });

      const mockShouldShow = spyOn(deduplication, 'shouldShowResult');
      mockShouldShow.mockClear();
      mockShouldShow.mockReturnValue(true);
      const _mockMarkShown = spyOn(deduplication, 'markResultShown');
      _mockMarkShown.mockClear();

      const hookData = {
        tool_response: {
          output: 'Files modified: test1.ts and test2.py'
        }
      };

      const result = await runHookAndCaptureExit(handlePostToolUse(JSON.stringify(hookData)));
      expect(result.exitCode).toBe(2); // Exit code 2 when diagnostics found
      
      expect(mockCheckFile).toHaveBeenCalledTimes(2);
      const errorOutput = consoleErrorOutput.find(o => o.includes('[[system-message]]'));
      expect(errorOutput).toContain('"summary":"1 error(s), 1 warning(s)"');
    });

    test('should skip files when checking is disabled', async () => {
      const mockCheckFile = spyOn(fileChecker, 'checkFile');
      mockCheckFile.mockResolvedValue(null); // null means checking disabled

      const hookData = {
        tool_input: {
          file_path: 'test.scala' // Scala might be disabled
        }
      };

      const result = await runHookAndCaptureExit(handlePostToolUse(JSON.stringify(hookData)));
      expect(result.exitCode).toBe(0); // Disabled language exits cleanly with 0
      expect(mockCheckFile).toHaveBeenCalled();
      expect(consoleErrorOutput.find(o => o.includes('[[system-message]]'))).toBeUndefined();
    });

    test('should respect deduplication and not show same results', async () => {
      const mockCheckFile = spyOn(fileChecker, 'checkFile');
      mockCheckFile.mockClear();
      mockCheckFile.mockResolvedValue({
        file: 'test.ts',
        tool: 'typescript',
        diagnostics: [{
          severity: 'error' as const,
          message: 'Same error',
          line: 1,
          column: 1
        }]
      });

      const mockShouldShow = spyOn(deduplication, 'shouldShowResult');
      mockShouldShow.mockClear();
      mockShouldShow.mockReturnValue(false); // Already shown
      const _mockMarkShown = spyOn(deduplication, 'markResultShown');
      _mockMarkShown.mockClear();

      const hookData = {
        tool_input: {
          file_path: 'test.ts'
        },
        cwd: process.cwd() // Add cwd to avoid issues with path resolution
      };

      const result = await runHookAndCaptureExit(handlePostToolUse(JSON.stringify(hookData)));
      
      expect(result.exitCode).toBe(0); // Should exit 0 when duplicated results are suppressed
      
      expect(mockCheckFile).toHaveBeenCalled();
      expect(mockShouldShow).toHaveBeenCalled();
      expect(_mockMarkShown).not.toHaveBeenCalled(); // Should not mark if not shown
      expect(consoleErrorOutput.find(o => o.includes('[[system-message]]'))).toBeUndefined();
      // The "Hook processing failed" message comes from catching the mocked process.exit, not a real error
      // So we don't check for it here
    });

    test('should limit diagnostics to maximum 5 items', async () => {
      const mockCheckFile = spyOn(fileChecker, 'checkFile');
      const manyDiagnostics = Array.from({ length: 10 }, (_, i) => ({
        severity: 'error' as const,
        message: `Error ${i + 1}`,
        line: i + 1,
        column: 1
      }));
      
      mockCheckFile.mockResolvedValue({
        file: 'test.ts',
        tool: 'typescript',
        diagnostics: manyDiagnostics
      });

      const mockShouldShow = spyOn(deduplication, 'shouldShowResult');
      mockShouldShow.mockReturnValue(true);
      const _mockMarkShown = spyOn(deduplication, 'markResultShown');

      const hookData = {
        tool_input: {
          file_path: 'test.ts'
        }
      };

      const result = await runHookAndCaptureExit(handlePostToolUse(JSON.stringify(hookData)));
      expect(result.exitCode).toBe(2); // Exit code 2 when diagnostics found
      
      const errorOutput = consoleErrorOutput.find(o => o.includes('[[system-message]]'));
      const parsed = JSON.parse(errorOutput!.replace('[[system-message]]:', ''));
      expect(parsed.diagnostics.length).toBe(5); // Limited to 5
      expect(parsed.summary).toBe('10 error(s)'); // But summary shows all
    });

    test('should handle errors gracefully', async () => {
      const mockCheckFile = spyOn(fileChecker, 'checkFile');
      mockCheckFile.mockRejectedValue(new Error('Check failed'));

      const hookData = {
        tool_input: {
          file_path: 'test.ts'
        }
      };

      const result = await runHookAndCaptureExit(handlePostToolUse(JSON.stringify(hookData)));
      expect(result.exitCode).toBe(1);
      expect(consoleErrorOutput.some(o => o.includes('Hook processing failed'))).toBe(true);
    });

    test('should handle absolute paths correctly', async () => {
      const mockCheckFile = spyOn(fileChecker, 'checkFile');
      mockCheckFile.mockResolvedValue(null);

      const hookData = {
        tool_input: {
          file_path: '/absolute/path/test.ts'
        },
        cwd: '/different/dir'
      };

      const result = await runHookAndCaptureExit(handlePostToolUse(JSON.stringify(hookData)));
      expect(result.exitCode).toBe(0); // No diagnostics exits cleanly with 0
      expect(mockCheckFile).toHaveBeenCalledWith('/absolute/path/test.ts'); // Should use absolute path as-is
    });

    test('should filter to only show errors and warnings', async () => {
      const mockCheckFile = spyOn(fileChecker, 'checkFile');
      mockCheckFile.mockResolvedValue({
        file: 'test.ts',
        tool: 'typescript',
        diagnostics: [
          { severity: 'error' as const, message: 'Error', line: 1, column: 1 },
          { severity: 'warning' as const, message: 'Warning', line: 2, column: 1 },
          { severity: 'info' as const, message: 'Info', line: 3, column: 1 }
        ]
      });

      const mockShouldShow = spyOn(deduplication, 'shouldShowResult');
      mockShouldShow.mockReturnValue(true);
      const _mockMarkShown = spyOn(deduplication, 'markResultShown');

      const hookData = {
        tool_input: { file_path: 'test.ts' }
      };

      const result = await runHookAndCaptureExit(handlePostToolUse(JSON.stringify(hookData)));
      expect(result.exitCode).toBe(2); // Exit code 2 when diagnostics found
      
      const errorOutput = consoleErrorOutput.find(o => o.includes('[[system-message]]'));
      const parsed = JSON.parse(errorOutput!.replace('[[system-message]]:', ''));
      expect(parsed.diagnostics.length).toBe(2); // Only error and warning
      expect(parsed.diagnostics.every((d: any) => d.severity === 'error' || d.severity === 'warning')).toBe(true);
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
          expected: ['test.ts']
        },
        {
          name: 'tool_response.filePath',
          data: { tool_response: { filePath: 'test.py' } },
          expected: ['test.py']
        },
        {
          name: 'output in tool_response',
          data: { tool_response: { output: 'Modified _file: src/main.go' } },
          expected: ['src/main.go']
        },
        {
          name: 'command in tool_input',
          data: { tool_input: { command: 'cat package.json test.rs' } },
          expected: ['test.rs']
        },
        {
          name: 'multiple files',
          data: { 
            tool_response: { 
              output: 'Files modified: test1.ts and test2.py and test3.java' 
            } 
          },
          expected: ['test1.ts', 'test2.py', 'test3.java']
        }
      ];

      for (let i = 0; i < testCases.length; i++) {
        const testCase = testCases[i];
        mockCheckFile.mockClear();
        
        const result = await runHookAndCaptureExit(handlePostToolUse(JSON.stringify(testCase.data)));
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
/**
 * Tests for multiple file updates showing combined results
 */

import { describe, test, expect, beforeEach, afterEach, spyOn } from 'bun:test';
import { handlePostToolUse } from '../src/cli/hooks/post-tool-use';
import * as fileChecker from '../src/file-checker';
import * as deduplication from '../src/cli/utils/deduplication';

// Store original process.exit
const originalExit = process.exit;
let _exitCode: number | undefined;
void _exitCode;

// Helper to capture console output
let consoleOutput: string[] = [];
let consoleErrorOutput: string[] = [];
let stderrOutput: string[] = [];
const originalConsoleLog = console.log;
const originalConsoleError = console.error;
const originalStderrWrite = process.stderr.write;

// Helper function to run async hook and capture exit
async function runHookAndCaptureExit(
  fn: Promise<void>
): Promise<{ exitCode?: number; output?: any }> {
  try {
    await fn;
    return { exitCode: undefined };
  } catch (error: any) {
    if (error.message && error.message.includes('process.exit')) {
      // Extract exit code from the error message
      const match = error.message.match(/process\.exit\((\d+)\)/);
      const code = match ? parseInt(match[1]) : (error.exitCode ?? 0);

      // Try to extract shell integration output from stderr
      const fullStderr = stderrOutput.join('');
      let output;

      // Parse human-readable diagnostic output
      if (fullStderr.includes('✗')) {
        try {
          // Parse the new format output
          const lines = fullStderr.split('\n').filter((line) => line.trim());
          const diagnostics: any[] = [];

          for (const line of lines) {
            // Match format: "  ✗ file.ts:1:7: message" or "  ⚠ file.ts:1:7: message"
            const errorMatch = line.match(/^\s*✗\s+([^:]+):(\d+):(\d+):\s*(.+)$/);
            const warningMatch = line.match(/^\s*⚠\s+([^:]+):(\d+):(\d+):\s*(.+)$/);

            if (errorMatch && errorMatch[1] && errorMatch[2] && errorMatch[3] && errorMatch[4]) {
              diagnostics.push({
                file: errorMatch[1],
                line: parseInt(errorMatch[2], 10),
                column: parseInt(errorMatch[3], 10),
                message: errorMatch[4],
                severity: 'error',
              });
            } else if (
              warningMatch &&
              warningMatch[1] &&
              warningMatch[2] &&
              warningMatch[3] &&
              warningMatch[4]
            ) {
              diagnostics.push({
                file: warningMatch[1],
                line: parseInt(warningMatch[2], 10),
                column: parseInt(warningMatch[3], 10),
                message: warningMatch[4],
                severity: 'warning',
              });
            }
          }

          // Extract the actual summary from stderr output
          const summaryMatch = fullStderr.match(/✗\s+([^\n]+found)/);
          const actualSummary = summaryMatch ? summaryMatch[1] : 'unknown';

          output = {
            diagnostics: diagnostics, // These are already limited by shell integration
            summary: actualSummary,
          };
        } catch (_parseError) {
          // Fallback: basic parsing
          const hasErrors = fullStderr.includes('✗');
          output = { hasErrors };
        }
      }

      return { exitCode: code, output };
    }
    throw error;
  }
}

describe('Multiple Files Combined Results', () => {
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
    process.stderr.write = ((data: any) => {
      stderrOutput.push(String(data));
      return true;
    }) as any;
  });

  afterEach(() => {
    // Restore console methods
    console.log = originalConsoleLog;
    console.error = originalConsoleError;
    process.stderr.write = originalStderrWrite;
    // Restore process.exit
    process.exit = originalExit;
  });

  test('should combine diagnostics from multiple TypeScript and Python files', async () => {
    const mockCheckFile = spyOn(fileChecker, 'checkFile');
    mockCheckFile.mockClear();
    mockCheckFile.mockImplementation(async (path: string) => {
      if (path.includes('component.tsx')) {
        return {
          file: 'src/component.tsx',
          tool: 'tsc',
          diagnostics: [
            {
              severity: 'error' as const,
              message: "Type 'number' is not assignable to type 'string'",
              line: 15,
              column: 7,
            },
            {
              severity: 'error' as const,
              message: "Cannot find name 'useState'",
              line: 8,
              column: 10,
            },
          ],
        };
      } else if (path.includes('utils.ts')) {
        return {
          file: 'src/utils.ts',
          tool: 'tsc',
          diagnostics: [
            {
              severity: 'warning' as const,
              message: "Unused variable 'temp'",
              line: 23,
              column: 5,
            },
          ],
        };
      } else if (path.includes('main.py')) {
        return {
          file: 'scripts/main.py',
          tool: 'python',
          diagnostics: [
            {
              severity: 'error' as const,
              message: "Undefined variable 'config'",
              line: 45,
              column: 12,
            },
          ],
        };
      }
      return null;
    });

    const mockShouldShow = spyOn(deduplication, 'shouldShowResult');
    mockShouldShow.mockReturnValue(true);
    const _mockMarkShown = spyOn(deduplication, 'markResultShown');
    void _mockMarkShown;

    const hookData = {
      tool: 'MultiEdit',
      tool_response: {
        output: 'Modified files: src/component.tsx src/utils.ts scripts/main.py',
      },
      cwd: '/project',
    };

    const result = await runHookAndCaptureExit(handlePostToolUse(JSON.stringify(hookData)));

    expect(result.exitCode).toBe(2); // Exit code 2 when diagnostics found
    expect(result.output).toBeDefined();

    // Check summary includes both errors and warnings
    expect(result.output.summary).toBe('3 errors, 1 warning found');

    // Check that diagnostics array contains items from all files (limited to 5)
    expect(result.output.diagnostics).toHaveLength(4); // We have 4 total diagnostics

    // Verify each diagnostic has the file field added
    expect(result.output.diagnostics[0]).toHaveProperty('file');
    expect(result.output.diagnostics[1]).toHaveProperty('file');
    expect(result.output.diagnostics[2]).toHaveProperty('file');
    expect(result.output.diagnostics[3]).toHaveProperty('file');

    // Verify diagnostics are from different files
    const files = result.output.diagnostics.map((d: any) => d.file);
    expect(files).toContain('src/component.tsx');
    expect(files).toContain('src/utils.ts');
    expect(files).toContain('scripts/main.py');

    // Verify specific diagnostics content
    const tsErrors = result.output.diagnostics.filter((d: any) => d.file === 'src/component.tsx');
    expect(tsErrors).toHaveLength(2);
    expect(tsErrors[0].message).toContain("Type 'number' is not assignable");

    const pyErrors = result.output.diagnostics.filter((d: any) => d.file === 'scripts/main.py');
    expect(pyErrors).toHaveLength(1);
    expect(pyErrors[0].message).toContain('Undefined variable');

    // Restore mocks
    mockCheckFile.mockRestore();
    mockShouldShow.mockRestore();
    _mockMarkShown.mockRestore();
  });

  test('should limit combined diagnostics to 5 items when there are many', async () => {
    const mockCheckFile = spyOn(fileChecker, 'checkFile');
    mockCheckFile.mockClear();
    mockCheckFile.mockImplementation(async (path: string) => {
      if (path.includes('file1.ts')) {
        // Return 4 diagnostics
        return {
          file: 'file1.ts',
          tool: 'tsc',
          diagnostics: Array.from({ length: 4 }, (_, i) => ({
            severity: 'error' as const,
            message: `Error ${i + 1} in file1`,
            line: i + 1,
            column: 1,
          })),
        };
      } else if (path.includes('file2.ts')) {
        // Return 3 diagnostics
        return {
          file: 'file2.ts',
          tool: 'tsc',
          diagnostics: Array.from({ length: 3 }, (_, i) => ({
            severity: 'error' as const,
            message: `Error ${i + 1} in file2`,
            line: i + 1,
            column: 1,
          })),
        };
      }
      return null;
    });

    const mockShouldShow = spyOn(deduplication, 'shouldShowResult');
    mockShouldShow.mockReturnValue(true);
    const _mockMarkShown = spyOn(deduplication, 'markResultShown');
    void _mockMarkShown;

    const hookData = {
      tool_response: {
        output: 'Updated file1.ts and file2.ts',
      },
    };

    const result = await runHookAndCaptureExit(handlePostToolUse(JSON.stringify(hookData)));

    expect(result.exitCode).toBe(2);
    expect(result.output).toBeDefined();

    // Should show total count in summary
    expect(result.output.summary).toBe('7 errors found');

    // But diagnostics array should be limited to 5
    expect(result.output.diagnostics).toHaveLength(5);

    // Verify we have diagnostics from both files in the limited set
    const file1Diags = result.output.diagnostics.filter((d: any) => d.file === 'file1.ts');
    const file2Diags = result.output.diagnostics.filter((d: any) => d.file === 'file2.ts');

    expect(file1Diags.length + file2Diags.length).toBe(5);
    expect(file1Diags.length).toBeGreaterThan(0);
    expect(file2Diags.length).toBeGreaterThan(0);

    // Restore mocks
    mockCheckFile.mockRestore();
  });

  test('should handle mix of files with and without diagnostics', async () => {
    const mockCheckFile = spyOn(fileChecker, 'checkFile');
    mockCheckFile.mockImplementation(async (path: string) => {
      if (path.includes('error.ts')) {
        return {
          file: 'error.ts',
          tool: 'tsc',
          diagnostics: [
            {
              severity: 'error' as const,
              message: 'Type error',
              line: 10,
              column: 5,
            },
          ],
        };
      } else if (path.includes('clean.ts')) {
        return {
          file: 'clean.ts',
          tool: 'tsc',
          diagnostics: [], // No errors
        };
      } else if (path.includes('disabled.scala')) {
        return null; // Language disabled
      }
      return {
        file: 'unknown',
        tool: 'unknown',
        diagnostics: [],
      };
    });

    const mockShouldShow = spyOn(deduplication, 'shouldShowResult');
    mockShouldShow.mockReturnValue(true);
    const _mockMarkShown = spyOn(deduplication, 'markResultShown');
    void _mockMarkShown;

    const hookData = {
      tool_response: {
        output: 'Modified error.ts clean.ts disabled.scala',
      },
    };

    const result = await runHookAndCaptureExit(handlePostToolUse(JSON.stringify(hookData)));

    expect(result.exitCode).toBe(2); // Has errors from error.ts
    expect(result.output).toBeDefined();

    // Should only count the file with errors
    expect(result.output.summary).toBe('1 error found');
    expect(result.output.diagnostics).toHaveLength(1);
    expect(result.output.diagnostics[0].file).toBe('error.ts');

    // Restore mocks
    mockCheckFile.mockRestore();
  });

  test('should handle deduplication correctly for multiple files', async () => {
    const mockCheckFile = spyOn(fileChecker, 'checkFile');
    mockCheckFile.mockClear();
    mockCheckFile.mockImplementation(async (path: string) => {
      if (path.includes('file1.ts')) {
        return {
          file: 'file1.ts',
          tool: 'tsc',
          diagnostics: [
            {
              severity: 'error' as const,
              message: 'Error in file1',
              line: 1,
              column: 1,
            },
          ],
        };
      } else if (path.includes('file2.ts')) {
        return {
          file: 'file2.ts',
          tool: 'tsc',
          diagnostics: [
            {
              severity: 'error' as const,
              message: 'Error in file2',
              line: 1,
              column: 1,
            },
          ],
        };
      }
      return null;
    });

    const mockShouldShow = spyOn(deduplication, 'shouldShowResult');
    mockShouldShow.mockClear();
    // First file should show, second file should not (already shown)
    let callCount = 0;
    mockShouldShow.mockImplementation((path: string) => {
      callCount++;
      // Only show file1.ts
      return path.includes('file1.ts');
    });
    const _mockMarkShown = spyOn(deduplication, 'markResultShown');
    void _mockMarkShown;
    _mockMarkShown.mockClear();

    const hookData = {
      tool_response: {
        output: 'Modified file1.ts and file2.ts',
      },
    };

    const result = await runHookAndCaptureExit(handlePostToolUse(JSON.stringify(hookData)));

    expect(result.exitCode).toBe(2); // Has errors from file1.ts
    expect(result.output).toBeDefined();

    // Should only show diagnostics from file1.ts (file2.ts was deduplicated)
    expect(result.output.summary).toBe('1 error found');
    expect(result.output.diagnostics).toHaveLength(1);
    expect(result.output.diagnostics[0].file).toBe('file1.ts');

    // Verify deduplication was checked for both files
    expect(callCount).toBe(2);
    // But only file1 was marked as shown
    expect(_mockMarkShown).toHaveBeenCalledTimes(1);

    // Restore mocks
    mockCheckFile.mockRestore();
    mockShouldShow.mockRestore();
    _mockMarkShown.mockRestore();
  });

  test('should handle all files being deduplicated', async () => {
    const mockCheckFile = spyOn(fileChecker, 'checkFile');
    mockCheckFile.mockClear();
    mockCheckFile.mockImplementation(async (path: string) => {
      return {
        file: path.includes('file1.ts') ? 'file1.ts' : 'file2.ts',
        tool: 'tsc',
        diagnostics: [
          {
            severity: 'error' as const,
            message: 'Same error',
            line: 1,
            column: 1,
          },
        ],
      };
    });

    const mockShouldShow = spyOn(deduplication, 'shouldShowResult');
    mockShouldShow.mockClear();
    // All files are deduplicated
    mockShouldShow.mockReturnValue(false);
    const _mockMarkShown = spyOn(deduplication, 'markResultShown');
    void _mockMarkShown;
    _mockMarkShown.mockClear();

    const hookData = {
      tool_response: {
        output: 'Modified file1.ts and file2.ts',
      },
    };

    const result = await runHookAndCaptureExit(handlePostToolUse(JSON.stringify(hookData)));

    // When all files are deduplicated, should exit 0 with no output
    expect(result.exitCode).toBe(0);
    expect(result.output).toBeUndefined();

    // Verify deduplication was checked
    expect(mockShouldShow).toHaveBeenCalled();
    // Since shouldShow returned false, markShown should not be called
    expect(_mockMarkShown).not.toHaveBeenCalled();
  });
});

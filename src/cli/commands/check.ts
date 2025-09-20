import { resolve } from 'path';
import { existsSync } from 'fs';
import { checkFile } from '../../file-checker';
import { outputDiagnostics, type ShellDiagnostic } from '../../shell-integration';

export async function runCheck(filePath: string): Promise<boolean> {
  if (!filePath) {
    return false;
  }

  const absolutePath = resolve(filePath);

  if (!existsSync(absolutePath)) {
    return false;
  }

  const result = await checkFile(absolutePath);
  if (result === null) {
    // Checking was disabled - exit silently with no output
    return false;
  } else if (result) {
    // Convert to shell diagnostics format
    const shellDiagnostics: ShellDiagnostic[] = result.diagnostics.map((diag) => ({
      ...diag,
      file: result.file,
    }));

    // Output using shell integration
    if (shellDiagnostics.length > 0) {
      outputDiagnostics(shellDiagnostics);
      return true; // Has errors
    } else {
      // For check command, show "No issues found" when no errors
      outputDiagnostics([]);
      return false; // No errors
    }
  } else {
    // File type not supported - also exit silently
    return false;
  }
}

/**
 * Check multiple files in parallel for better performance
 * Useful when Claude Code processes multiple files at once
 */
export async function runCheckMultiple(filePaths: string[]): Promise<boolean> {
  if (!filePaths || filePaths.length === 0) {
    return false;
  }

  // Filter to existing files first
  const validFiles = filePaths.map((filePath) => resolve(filePath)).filter(existsSync);

  if (validFiles.length === 0) {
    return false;
  }

  // Check files in parallel with limited concurrency to avoid overwhelming system
  const MAX_CONCURRENT = 4;
  const results: Array<{ file: string; result: Awaited<ReturnType<typeof checkFile>> }> = [];

  for (let i = 0; i < validFiles.length; i += MAX_CONCURRENT) {
    const batch = validFiles.slice(i, i + MAX_CONCURRENT);

    const batchResults = await Promise.all(
      batch.map(async (file) => ({
        file,
        result: await checkFile(file),
      }))
    );

    results.push(...batchResults);
  }

  // Collect all diagnostics across all files
  const allDiagnostics: ShellDiagnostic[] = [];

  for (const { result } of results) {
    if (result === null) {
      // Checking was disabled - skip
      continue;
    } else if (result && result.diagnostics.length > 0) {
      // Add diagnostics with file context
      const shellDiagnostics: ShellDiagnostic[] = result.diagnostics.map((diag) => ({
        ...diag,
        file: result.file,
      }));
      allDiagnostics.push(...shellDiagnostics);
    }
    // Skip unsupported file types silently
  }

  // Output all diagnostics at once using shell integration
  if (allDiagnostics.length > 0) {
    outputDiagnostics(allDiagnostics);
    return true; // Has errors
  } else {
    // For check command, show "No issues found" when no errors
    outputDiagnostics([]);
    return false; // No errors
  }
}

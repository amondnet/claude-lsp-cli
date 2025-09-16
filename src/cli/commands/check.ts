import { resolve } from 'path';
import { existsSync } from 'fs';
import { checkFile, formatDiagnostics } from '../../file-checker';

export async function runCheck(
  filePath: string,
  log: (..._args: unknown[]) => unknown = console.log
): Promise<void> {
  if (!filePath) {
    return;
  }

  const absolutePath = resolve(filePath);

  if (!existsSync(absolutePath)) {
    return;
  }

  const result = await checkFile(absolutePath);
  if (result === null) {
    // Checking was disabled - exit silently with no output
    return;
  } else if (result) {
    // Use formatDiagnostics for both cases (with errors and without)
    const formatted = formatDiagnostics(result, true); // showNoErrors=true
    if (formatted) {
      log(formatted);
    }
  } else {
    // File type not supported - also exit silently
    return;
  }
}

/**
 * Check multiple files in parallel for better performance
 * Useful when Claude Code processes multiple files at once
 */
export async function runCheckMultiple(
  filePaths: string[],
  log: (..._args: unknown[]) => unknown = console.log
): Promise<void> {
  if (!filePaths || filePaths.length === 0) {
    return;
  }

  // Filter to existing files first
  const validFiles = filePaths.map((filePath) => resolve(filePath)).filter(existsSync);

  if (validFiles.length === 0) {
    return;
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

  // Output results in original file order
  for (const { result } of results) {
    if (result === null) {
      // Checking was disabled - skip
      continue;
    } else if (result) {
      const formatted = formatDiagnostics(result, true);
      if (formatted) {
        log(formatted);
      }
    }
    // Skip unsupported file types silently
  }
}

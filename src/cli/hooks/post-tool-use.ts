import { join } from 'path';
import { checkFile } from '../../file-checker';
import type { Diagnostic } from '../../file-checker';
import { extractFilePaths } from '../utils/file-extraction';
import { shouldShowResult, markResultShown } from '../utils/deduplication';

export async function handlePostToolUse(input: string): Promise<void> {
  try {
    if (!input.trim()) {
      process.exit(0);
      return; // For testing
    }

    let hookData: unknown;
    try {
      hookData = JSON.parse(input);
    } catch {
      process.exit(0);
      return; // For testing
    }

    const filePaths = extractFilePaths(hookData);
    if (filePaths.length === 0) {
      process.exit(0);
      return; // For testing
    }

    // Process all files in parallel and collect results
    const absolutePaths = filePaths.map((filePath) =>
      filePath.startsWith('/')
        ? filePath
        : join((hookData as { cwd?: string })?.cwd || process.cwd(), filePath)
    );

    // Debug output removed - would interfere with CLI stdin/stdout

    const results = await Promise.all(absolutePaths.map((absolutePath) => checkFile(absolutePath)));

    const allDiagnostics: Diagnostic[] = [];
    let hasErrors = false;

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const absolutePath = absolutePaths[i];

      // Skip if checking was disabled (result is null) or file type not supported
      if (!result) {
        continue;
      }

      if (result.diagnostics.length > 0) {
        const importantIssues = result.diagnostics.filter(
          (d) => d.severity === 'error' || d.severity === 'warning'
        );

        if (importantIssues.length > 0 && shouldShowResult(absolutePath)) {
          // Add file context to diagnostics
          const fileRelativePath = result.file || filePaths[i];
          for (const diag of importantIssues) {
            allDiagnostics.push({
              ...diag,
              file: fileRelativePath,
            });
          }
          markResultShown(absolutePath);
          hasErrors = true;
        }
      }
    }

    // Show combined results if any errors found
    if (hasErrors && allDiagnostics.length > 0) {
      // Count all diagnostics for summary
      const errors = allDiagnostics.filter((d) => d.severity === 'error');
      const warnings = allDiagnostics.filter((d) => d.severity === 'warning');

      const summaryParts = [];
      if (errors.length > 0) summaryParts.push(`${errors.length} error(s)`);
      if (warnings.length > 0) summaryParts.push(`${warnings.length} warning(s)`);

      // Format output with limited diagnostics but full count
      const output = {
        diagnostics: allDiagnostics.slice(0, 5), // Show at most 5 items
        summary: summaryParts.join(', '),
      };

      console.error(`[[system-message]]:${JSON.stringify(output)}`);
      process.exit(2);
      return; // For testing
    }

    process.exit(0);
  } catch (error: unknown) {
    // In tests, process.exit is mocked to throw an error.
    // Re-throw these so tests can capture the intended exit code.
    if (
      error &&
      typeof error === 'object' &&
      'message' in error &&
      typeof error.message === 'string' &&
      error.message.includes('process.exit(')
    ) {
      throw error;
    }
    console.error(`Hook processing failed: ${error}`);
    process.exit(1);
  }
}

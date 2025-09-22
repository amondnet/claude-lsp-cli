/**
 * Shell integration utilities for OSC 633 sequences
 *
 * This module provides modern shell integration using OSC 633 sequences,
 * replacing the legacy [[system-message]]: JSON format. It works in VS Code,
 * Warp, and other terminals that support OSC 633.
 *
 * Output format:
 * - Clean visible summary: "✗ 3 errors found"
 * - Detailed diagnostics in OSC metadata (accessible via Ctrl+O in Claude Code)
 * - Limited to 5 detailed items to prevent overwhelming output
 * - Silent for hooks when no errors, shows "No issues found" for CLI commands
 */

import type { Diagnostic } from './file-checker';

const ESC = '\x1b';
const OSC = `${ESC}]`;
const ST = '\x07';

export interface ShellDiagnostic extends Diagnostic {
  file: string;
  code?: string;
}

export interface ShellIntegrationOutput {
  commandMetadata: string;
  visibleOutput: string;
  exitCode: number;
}

/**
 * Format diagnostics for shell integration output
 */
export function formatShellIntegrationOutput(
  diagnostics: ShellDiagnostic[]
): ShellIntegrationOutput {
  if (diagnostics.length === 0) {
    return {
      commandMetadata: 'claude-lsp-cli diagnostics: No issues found',
      visibleOutput: '', // Silent when no errors
      exitCode: 0,
    };
  }

  // Count errors and warnings
  let errorCount = 0;
  let warningCount = 0;
  const affectedFiles = new Set<string>();

  // Count all diagnostics for accurate summary
  for (const diag of diagnostics) {
    affectedFiles.add(diag.file);

    if (diag.severity === 'error') {
      errorCount++;
    } else {
      warningCount++;
    }
  }

  // Build detailed diagnostics for command metadata (limit to first 5 for readability)
  const detailedLines: string[] = ['>'];
  const maxDiagnosticsToShow = 5;

  for (let i = 0; i < Math.min(diagnostics.length, maxDiagnosticsToShow); i++) {
    const diag = diagnostics[i];
    if (!diag) continue; // TypeScript safety check

    const severityIcon = diag.severity === 'error' ? '✗' : '⚠';
    const code = diag.code ? `${diag.code}: ` : '';
    detailedLines.push(
      `${severityIcon} ${diag.file}:${diag.line}:${diag.column} - ${code}${diag.message}`
    );
  }

  // Build visible summary
  const summaryParts: string[] = [];
  if (errorCount > 0) {
    summaryParts.push(`${errorCount} error${errorCount !== 1 ? 's' : ''}`);
  }
  if (warningCount > 0) {
    summaryParts.push(`${warningCount} warning${warningCount !== 1 ? 's' : ''}`);
  }

  // Create a one-liner JSON array format that's both human and Claude readable
  const firstError = diagnostics.find((d) => d.severity === 'error');
  const fileList = Array.from(affectedFiles);

  // Compact JSON format: [errors, warnings, "first_file:line", "error_snippet"]
  const summary: any[] = [errorCount];
  if (warningCount > 0) summary.push(warningCount);

  if (firstError) {
    const shortFile = firstError.file.split('/').pop() || firstError.file;
    summary.push(`${shortFile}:${firstError.line}`);
    const shortMsg =
      firstError.message.length > 40
        ? firstError.message.substring(0, 37) + '...'
        : firstError.message;
    summary.push(shortMsg);
  }

  // Add file count if many files affected
  if (fileList.length > 3) {
    summary.push(`${fileList.length} files`);
  }

  const visibleSummary = JSON.stringify(summary);

  return {
    commandMetadata: detailedLines.join('\n'), // Use actual newlines
    visibleOutput: visibleSummary,
    exitCode: 1,
  };
}

/**
 * Write shell integration output with OSC 633 sequences
 */
export function writeShellIntegrationOutput(output: ShellIntegrationOutput): void {
  // Add OSC sequences for terminal integration (detailed diagnostics in metadata)
  process.stderr.write(`${OSC}633;A${ST}`);
  process.stderr.write(`${OSC}633;B${ST}`);
  process.stderr.write(`${OSC}633;C${ST}`);
  process.stderr.write(`${OSC}633;E;${output.commandMetadata}${ST}\n`);
  process.stderr.write(`${OSC}633;D;${output.exitCode}${ST}`);

  // Show clean summary in normal stderr (visible to user)
  if (output.exitCode !== 0 && output.visibleOutput) {
    console.error(output.visibleOutput);
  }
}

/**
 * Convert diagnostics and write shell integration output
 */
export function outputDiagnostics(diagnostics: ShellDiagnostic[]): void {
  const output = formatShellIntegrationOutput(diagnostics);
  writeShellIntegrationOutput(output);
}

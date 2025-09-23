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

// Unused but keeping for potential future OSC sequence use
// const ESC = '\x1b';
// const OSC = `${ESC}]`;
// const ST = '\x07';

export interface ShellDiagnostic extends Diagnostic {
  file: string;
  code?: string;
}

export interface ShellIntegrationOutput {
  summary: string;
  exitCode: number;
}

/**
 * Format diagnostics for shell integration output
 */
export function formatShellIntegrationOutput(
  diagnostics: ShellDiagnostic[],
  isHook = false
): ShellIntegrationOutput {
  if (diagnostics.length === 0) {
    return {
      summary: isHook ? '' : 'No issues found', // Silent for hooks, message for check command
      exitCode: 0,
    };
  }

  // Count errors and warnings
  let errorCount = 0;
  let warningCount = 0;

  // Count all diagnostics for accurate summary
  for (const diag of diagnostics) {
    if (diag.severity === 'error') {
      errorCount++;
    } else {
      warningCount++;
    }
  }

  // Build detailed diagnostics (show first 5 items)
  const detailedLines: string[] = [];
  const maxDiagnosticsToShow = 5;

  for (let i = 0; i < Math.min(diagnostics.length, maxDiagnosticsToShow); i++) {
    const diag = diagnostics[i];
    if (!diag) continue;

    const severityIcon = diag.severity === 'error' ? '✗' : '⚠';
    const code = diag.code ? ` [${diag.code}]` : '';
    detailedLines.push(
      `  ${severityIcon} ${diag.file}:${diag.line}:${diag.column}${code}: ${diag.message}`
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

  // Add "and X more" if there are more diagnostics
  if (diagnostics.length > maxDiagnosticsToShow) {
    detailedLines.push(`  ... and ${diagnostics.length - maxDiagnosticsToShow} more`);
  }

  // Combine details and summary
  const summary = `✗ ${summaryParts.join(', ')} found`;
  const output = detailedLines.length > 0 ? `${summary}\n${detailedLines.join('\n')}` : summary;

  return {
    summary: output,
    exitCode: 1,
  };
}

/**
 * Write shell integration output with OSC 633 sequences
 */
export function writeShellIntegrationOutput(output: ShellIntegrationOutput): void {
  // Skip output only if there's no summary (silent for hooks with no errors)
  if (!output.summary) return;

  // Just output the clean summary - this works without issues
  process.stderr.write('\n');
  process.stderr.write(output.summary);
}

/**
 * Convert diagnostics and write shell integration output
 */
export function outputDiagnostics(diagnostics: ShellDiagnostic[], isHook = false): void {
  const output = formatShellIntegrationOutput(diagnostics, isHook);
  writeShellIntegrationOutput(output);
}

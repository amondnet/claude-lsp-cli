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

  // Create more informative visible output
  const visibleLines: string[] = [`✗ ${summaryParts.join(', ')} found`];

  // Show first few errors in visible output for better context
  const maxVisibleErrors = 3;
  const errorSample = diagnostics.filter((d) => d.severity === 'error').slice(0, maxVisibleErrors);

  if (errorSample.length > 0) {
    visibleLines.push('  First errors:');
    errorSample.forEach((diag) => {
      const shortFile = diag.file.split('/').pop() || diag.file;
      const shortMsg =
        diag.message.length > 60 ? diag.message.substring(0, 57) + '...' : diag.message;
      visibleLines.push(`    ${shortFile}:${diag.line} - ${shortMsg}`);
    });

    if (diagnostics.filter((d) => d.severity === 'error').length > maxVisibleErrors) {
      visibleLines.push(
        `    ... and ${diagnostics.filter((d) => d.severity === 'error').length - maxVisibleErrors} more errors`
      );
    }
  }

  if (affectedFiles.size > 0) {
    const fileList = Array.from(affectedFiles);
    if (fileList.length <= 3) {
      visibleLines.push(`  Files: ${fileList.join(', ')}`);
    } else {
      visibleLines.push(
        `  Files: ${fileList.slice(0, 3).join(', ')} and ${fileList.length - 3} more`
      );
    }
  }

  return {
    commandMetadata: detailedLines.join('\n'), // Use actual newlines
    visibleOutput: visibleLines.join('\n'),
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

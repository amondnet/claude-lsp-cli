#!/usr/bin/env bun
/**
 * File-Based Type Checker V2 - Registry-based implementation
 *
 * Uses the language registry for all checking
 */

import { existsSync } from 'fs';
import { findProjectRoot } from './utils/common';

export interface Diagnostic {
  line: number;
  column: number;
  severity: 'error' | 'warning' | 'info';
  message: string;
  file?: string; // Optional file field for when combining multiple files
}

export interface FileCheckResult {
  file: string;
  tool: string;
  diagnostics: Array<Diagnostic>;
  timedOut?: boolean;
}

/**
 * Format diagnostics for CLI output
 */
export function formatDiagnostics(
  result: FileCheckResult | null,
  showNoErrors: boolean = false
): string {
  // Handle null result
  if (!result) {
    return '';
  }

  // Handle no diagnostics case
  if (result.diagnostics.length === 0) {
    if (showNoErrors) {
      // Show "no errors or warnings" message
      return '{"summary":"no errors or warnings"}';
    }
    return '';
  }

  const diagnostics = result.diagnostics;
  const errors = diagnostics.filter((d) => d.severity === 'error').length;
  const warnings = diagnostics.filter((d) => d.severity === 'warning').length;

  // Create system message with diagnostics (always use (s) format for consistency)
  const summaryParts = [];
  if (errors > 0) summaryParts.push(`${errors} error(s)`);
  if (warnings > 0) summaryParts.push(`${warnings} warning(s)`);
  const summary = summaryParts.join(', ');
  const output = {
    diagnostics: diagnostics.map((d) => ({
      file: d.file || result.file, // Use diagnostic's file if set, otherwise use result's file
      line: d.line,
      column: d.column,
      severity: d.severity,
      message: d.message,
    })),
    summary: summary,
  };

  return JSON.stringify(output);
}

/**
 * Check a single file using the language registry
 */
export async function checkFile(filePath: string): Promise<FileCheckResult | null> {
  if (!existsSync(filePath)) {
    return null;
  }

  const projectRoot = findProjectRoot(filePath);

  // Use registry-based checker
  try {
    const { checkFileWithRegistry } = await import('./generic-checker');
    const result = await checkFileWithRegistry(filePath, projectRoot);
    return result;
  } catch (_error) {
    // Return null if registry check fails
    return null;
  }
}

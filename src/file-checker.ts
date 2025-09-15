#!/usr/bin/env bun
/**
 * File-Based Type Checker V2 - Registry-based implementation
 *
 * Uses the language registry for all checking
 */

import { existsSync } from 'fs';
import { findProjectRoot } from './utils/common';

export interface FileCheckResult {
  file: string;
  tool: string;
  diagnostics: Array<{
    line: number;
    column: number;
    severity: 'error' | 'warning' | 'info';
    message: string;
  }>;
  timedOut?: boolean;
}

/**
 * Format diagnostics for CLI output
 */
export function formatDiagnostics(result: FileCheckResult): string {
  if (!result || result.diagnostics.length === 0) {
    return '';
  }

  const diagnostics = result.diagnostics;
  const errors = diagnostics.filter((d) => d.severity === 'error').length;
  const warnings = diagnostics.filter((d) => d.severity === 'warning').length;

  // Create system message with diagnostics
  const summary = `${errors} errors, ${warnings} warnings`;
  const output = {
    diagnostics: diagnostics.map((d) => ({
      file: result.file,
      line: d.line,
      column: d.column,
      severity: d.severity,
      message: d.message,
    })),
    summary: summary,
  };

  return `[[system-message]]:${JSON.stringify(output)}`;
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

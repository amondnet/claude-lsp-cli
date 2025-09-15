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

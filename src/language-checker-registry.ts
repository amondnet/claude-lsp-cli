/**
 * Language Checker Registry - Centralized configuration and common patterns
 *
 * This module extracts the common patterns from language checker functions
 * and provides a registry-based architecture for maintainability.
 */

import { existsSync } from 'fs';
import { join, relative } from 'path';
import type { FileCheckResult } from './file-checker';

// Registry interface for language checkers
export interface LanguageConfig {
  /** Human-readable name for disable checks */
  name: string;
  /** Primary tool command name */
  tool: string;
  /** File extensions this checker handles */
  extensions: string[];
  /** Local binary paths to check (relative to project root and CWD) */
  localPaths: string[];
  /** Function to build command arguments */
  buildArgs: (
    _file: string,
    _projectRoot: string,
    _toolCommand: string,
    _context?: unknown
  ) => { tool?: string; args: string[] } | string[];
  /** Function to parse tool output into diagnostics */
  parseOutput: (
    _stdout: string,
    _stderr: string,
    _file: string,
    _projectRoot: string
  ) => FileCheckResult['diagnostics'];
  /** Optional: project configuration detection */
  detectConfig?: (_projectRoot: string) => boolean;
  /** Optional: additional setup before running command */
  setupCommand?: (
    _file: string,
    _projectRoot: string
  ) => Promise<{ cleanup?: () => void; context?: unknown }>;
}

// Registry of all supported language checkers
export const LANGUAGE_REGISTRY = new Map<string, LanguageConfig>();

// Helper function to register a language checker
export function registerLanguage(extensions: string[], config: LanguageConfig): void {
  for (const ext of extensions) {
    LANGUAGE_REGISTRY.set(ext.toLowerCase(), config);
  }
}

// Helper function to find local tool installation
export function findLocalTool(projectRoot: string, localPaths: string[]): string | null {
  // Check in the project being analyzed
  for (const localPath of localPaths) {
    const projectLocalTool = join(projectRoot, localPath);
    if (existsSync(projectLocalTool)) {
      return projectLocalTool;
    }
  }

  // Check relative to current working directory (where the binary is run from)
  for (const localPath of localPaths) {
    const cwdLocalTool = join(process.cwd(), localPath);
    if (existsSync(cwdLocalTool)) {
      return cwdLocalTool;
    }
  }

  return null;
}

// Common diagnostic severity mapping
export function mapSeverity(level: string | number): 'error' | 'warning' | 'info' {
  if (typeof level === 'number') {
    if (level >= 3) return 'error';
    if (level >= 2) return 'warning';
    return 'info';
  }

  const levelStr = level.toLowerCase();
  if (levelStr.includes('error') || levelStr.includes('fail')) return 'error';
  if (levelStr.includes('warn') || levelStr.includes('warning')) return 'warning';
  return 'info';
}

// Common function to create FileCheckResult structure
export function createResult(file: string, projectRoot: string, tool: string): FileCheckResult {
  const relativePath = relative(projectRoot, file);
  return {
    file: relativePath,
    tool,
    diagnostics: [],
  };
}

// Helper for ANSI escape sequence removal (common across parsers)
export function stripAnsiCodes(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\x1b\[[0-9;]*m/g, '');
}

// Common error message filtering patterns
export const COMMON_FILTERS = {
  // Skip attribute access errors on 'any' type (too noisy)
  TYPESCRIPT_ANY_ACCESS: /Property .+ does not exist on type 'any'/,

  // Skip import resolution hints (not actual errors)
  PYTHON_IMPORT_HINTS: /Try "python -m pip install"/,

  // Skip formatting suggestions
  GO_FORMATTING: /should use .+ instead of/,

  // Skip unused variable warnings in examples/tests
  UNUSED_VARIABLES: /(unused variable|is never used|is assigned a value but never used)/i,
};

// Helper to apply common filters
export function shouldSkipDiagnostic(message: string, file: string): boolean {
  // Skip example files entirely for some errors
  if (file.includes('/examples/')) {
    if (COMMON_FILTERS.UNUSED_VARIABLES.test(message)) {
      return true;
    }
  }

  // Apply other common filters
  return Object.values(COMMON_FILTERS).some((filter) =>
    typeof filter.test === 'function' ? filter.test(message) : false
  );
}

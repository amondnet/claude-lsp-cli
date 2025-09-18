/**
 * TypeScript Language Checker Configuration
 */

import { existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { createHash } from 'crypto';
import type { LanguageConfig } from '../language-checker-registry';
import { mapSeverity, stripAnsiCodes, shouldSkipDiagnostic } from '../language-checker-registry';
import { findTsconfigRoot } from '../utils/common';

// findTsconfigRoot is now imported from utils/common

export const typescriptConfig: LanguageConfig = {
  name: 'TypeScript',
  tool: 'tsc',
  extensions: ['.ts', '.tsx', '.mts', '.cts'],
  localPaths: ['node_modules/.bin/tsc'],

  buildArgs: (file: string, projectRoot: string, _toolCommand: string, _context?: any) => {
    const args = ['--noEmit', '--pretty', 'false'];

    // Enable incremental compilation for faster subsequent checks
    args.push('--incremental');

    // Create project-specific cache directory in temp folder
    const projectHash = createHash('md5').update(projectRoot).digest('hex');
    const tsBuildInfoDir = join(tmpdir(), 'claude-lsp-ts', projectHash);
    args.push('--tsBuildInfoFile', join(tsBuildInfoDir, 'project.tsbuildinfo'));

    // Look for tsconfig in the project
    const tsconfigRoot = findTsconfigRoot(file);
    if (tsconfigRoot) {
      const tsconfigPath = join(tsconfigRoot, 'tsconfig.json');
      args.push('--project', tsconfigPath);
    } else {
      // No tsconfig, just check the file
      args.push(file);
    }

    return args;
  },

  setupCommand: async (file: string, _projectRoot: string) => {
    // No special setup needed - we'll just use the project's tsconfig
    // and filter diagnostics to the target file
    return {
      context: undefined,
      cleanup: undefined,
    };
  },

  parseOutput: (stdout: string, stderr: string, _file: string, _projectRoot: string) => {
    const diagnostics: Array<{
      line: number;
      column: number;
      severity: 'error' | 'warning' | 'info';
      message: string;
    }> = [];

    // TypeScript outputs to stderr when there are errors
    const output = stderr || stdout;
    if (!output.trim()) return diagnostics;

    // Parse TypeScript diagnostic output
    // Format: filename(line,col): error/warning TS####: message
    const lines = output.split('\n');

    for (const line of lines) {
      const stripped = stripAnsiCodes(line.trim());
      if (!stripped) continue;

      // Match TypeScript diagnostic format
      const match = stripped.match(/^(.+?)\((\d+),(\d+)\):\s+(error|warning)\s+TS\d+:\s*(.+)$/);
      if (!match) continue;

      const [, filePath, lineStr, colStr, severity, message] = match;

      // With noUncheckedIndexedAccess, all array access could be undefined
      // Check that we have all required values from the regex match
      if (!filePath || !lineStr || !colStr || !severity || !message) {
        continue;
      }

      // Only include diagnostics for the file we're checking
      // Debug: log what we're comparing
      if (!filePath.endsWith(_file) && !_file.endsWith(filePath)) {
        // For now, let's be more lenient - check if the base filename matches
        const fileName = _file.split('/').pop();
        if (!fileName || !filePath.includes(fileName)) {
          continue;
        }
      }
      const lineNum = parseInt(lineStr, 10);
      const colNum = parseInt(colStr, 10);

      // Skip if this diagnostic should be filtered
      if (shouldSkipDiagnostic(message, _file)) {
        continue;
      }

      diagnostics.push({
        line: lineNum,
        column: colNum,
        severity: mapSeverity(severity),
        message: message.trim(),
      });
    }

    return diagnostics;
  },

  detectConfig: (_projectRoot: string) => {
    return (
      existsSync(join(_projectRoot, 'tsconfig.json')) ||
      existsSync(join(_projectRoot, 'package.json'))
    );
  },
};

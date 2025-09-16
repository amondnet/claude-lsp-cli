/**
 * TypeScript Language Checker Configuration
 */

import { existsSync, writeFileSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
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

  buildArgs: (_file: string, _projectRoot: string, _toolCommand: string, context?: any) => {
    const args = ['--noEmit', '--pretty', 'false'];

    // Enable incremental compilation for faster subsequent checks
    args.push('--incremental');

    // Create project-specific cache directory in temp folder
    const projectHash = createHash('md5').update(_projectRoot).digest('hex');
    const tsBuildInfoDir = join(tmpdir(), 'claude-lsp-ts', projectHash);

    // If we have a temporary tsconfig from setupCommand, use it
    if (context?.tempTsconfigPath) {
      args.push('--project', context.tempTsconfigPath);
      args.push('--tsBuildInfoFile', join(tsBuildInfoDir, 'project.tsbuildinfo'));
    } else {
      // Just check the single file with incremental info
      const fileHash = createHash('md5').update(_file).digest('hex').substring(0, 8);
      args.push('--tsBuildInfoFile', join(tsBuildInfoDir, `file-${fileHash}.tsbuildinfo`));
      args.push(_file);
    }

    return args;
  },

  setupCommand: async (file: string, _projectRoot: string) => {
    const tsconfigRoot = findTsconfigRoot(file);
    let tempTsconfigPath: string | null = null;

    if (tsconfigRoot) {
      const tsconfigPath = join(tsconfigRoot, 'tsconfig.json');

      // Create a temporary tsconfig that extends the original but only includes our target file
      try {
        const tempTsconfig = {
          extends: tsconfigPath,
          compilerOptions: {
            skipLibCheck: true,
            noUnusedLocals: false,
            noUnusedParameters: false,
          },
          include: [file],
          exclude: [],
        };

        // Use a unique temp file name in system temp directory to avoid conflicts
        tempTsconfigPath = join(
          tmpdir(),
          `tsconfig-check-${Date.now()}-${Math.random().toString(36).substring(7)}.json`
        );
        writeFileSync(tempTsconfigPath, JSON.stringify(tempTsconfig, null, 2));

        // Debug output removed - would interfere with CLI stdin/stdout
      } catch (error) {
        // Error logging removed - would interfere with CLI stdin/stdout
        tempTsconfigPath = null;
      }
    }

    return {
      context: tempTsconfigPath ? { tempTsconfigPath } : undefined,
      cleanup: tempTsconfigPath
        ? () => {
            try {
              if (existsSync(tempTsconfigPath)) {
                unlinkSync(tempTsconfigPath);
                // Debug output removed - would interfere with CLI stdin/stdout
              }
            } catch (error) {
              // Error logging removed - would interfere with CLI stdin/stdout
            }
          }
        : undefined,
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

      const [, , lineStr, colStr, severity, message] = match;
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

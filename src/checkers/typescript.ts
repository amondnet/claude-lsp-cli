/**
 * TypeScript Language Checker Configuration
 */

import { existsSync } from 'fs';
import { join, resolve } from 'path';
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

  buildArgs: (file: string, projectRoot: string, _toolCommand: string, context?: any) => {
    const args = ['--noEmit', '--pretty', 'false'];

    // Enable incremental compilation for faster subsequent checks
    args.push('--incremental');

    // Create per-file cache to avoid conflicts when checking multiple files in parallel
    const projectHash = createHash('md5').update(projectRoot).digest('hex');
    const fileHash = createHash('md5').update(file).digest('hex').substring(0, 8);
    const tsBuildInfoDir = join(tmpdir(), 'claude-lsp-ts', projectHash);
    args.push('--tsBuildInfoFile', join(tsBuildInfoDir, `build-${fileHash}.tsbuildinfo`));

    // Use temp tsconfig from setupCommand
    if (context?.tempTsconfigPath) {
      args.push('--project', context.tempTsconfigPath);
    } else {
      // Fallback if no temp tsconfig
      args.push(file);
    }

    return args;
  },

  setupCommand: async (file: string, projectRoot: string) => {
    const tsconfigRoot = findTsconfigRoot(file);

    // Create temp tsconfig for single-file checking
    // Include file path in hash to avoid conflicts when checking multiple files in parallel
    const projectHash = createHash('md5').update(projectRoot).digest('hex');
    const fileHash = createHash('md5').update(file).digest('hex').substring(0, 8);
    const tempDir = join(tmpdir(), 'claude-lsp-ts', projectHash);
    const tempTsconfigPath = join(tempDir, `tsconfig-${fileHash}.json`);

    // Ensure temp directory exists using Bun API
    await Bun.write(join(tempDir, '.keep'), '');

    // Get absolute file path
    const absoluteFilePath = file.startsWith('/') ? file : join(process.cwd(), file);

    // Default compiler options (good defaults)
    const defaultCompilerOptions: Record<string, any> = {
      target: 'ES2020',
      module: 'ESNext',
      lib: ['ES2020', 'DOM'],
      strict: true,
      esModuleInterop: true,
      skipLibCheck: true,
      moduleResolution: 'node',
      noEmit: true,
      types: [], // Disable @types auto-loading to avoid missing type definition errors
    };

    let compilerOptions: Record<string, any> = { ...defaultCompilerOptions };
    let baseUrlRoot = projectRoot;

    if (tsconfigRoot) {
      // Project has tsconfig - read and copy all settings
      const originalTsconfigPath = join(tsconfigRoot, 'tsconfig.json');
      baseUrlRoot = tsconfigRoot;

      try {
        const content = await Bun.file(originalTsconfigPath).text();
        const originalConfig = JSON.parse(content);

        // Copy all compiler options from original
        if (originalConfig.compilerOptions) {
          compilerOptions = {
            ...defaultCompilerOptions, // Start with defaults
            ...originalConfig.compilerOptions, // Override with original settings
          };
        }

        // Convert relative baseUrl to absolute
        if (originalConfig.compilerOptions?.baseUrl) {
          const relativeBase = originalConfig.compilerOptions.baseUrl;
          compilerOptions.baseUrl = join(tsconfigRoot, relativeBase);
        } else {
          compilerOptions.baseUrl = tsconfigRoot;
        }

        // Convert relative paths in "paths" to absolute
        if (originalConfig.compilerOptions?.paths) {
          const absolutePaths: Record<string, string[]> = {};
          const baseForPaths = compilerOptions.baseUrl || tsconfigRoot;

          for (const [key, value] of Object.entries(originalConfig.compilerOptions.paths)) {
            if (Array.isArray(value)) {
              absolutePaths[key] = value.map((p: string) => {
                if (p.startsWith('/')) return p;
                return join(baseForPaths, p);
              });
            }
          }
          compilerOptions.paths = absolutePaths;
        }

        // Convert rootDir and outDir to absolute paths
        if (
          originalConfig.compilerOptions?.rootDir &&
          !originalConfig.compilerOptions.rootDir.startsWith('/')
        ) {
          compilerOptions.rootDir = join(tsconfigRoot, originalConfig.compilerOptions.rootDir);
        }
        if (
          originalConfig.compilerOptions?.outDir &&
          !originalConfig.compilerOptions.outDir.startsWith('/')
        ) {
          compilerOptions.outDir = join(tsconfigRoot, originalConfig.compilerOptions.outDir);
        }
      } catch {
        // Fallback to defaults on parse error
        compilerOptions.baseUrl = tsconfigRoot;
      }
    } else {
      // Standalone file - use defaults with project root as baseUrl
      compilerOptions.baseUrl = projectRoot;
    }

    // Always enforce these settings
    compilerOptions.noEmit = true;
    compilerOptions.skipLibCheck = true;

    const tempTsconfig = {
      compilerOptions,
      include: [absoluteFilePath],
    };

    await Bun.write(tempTsconfigPath, JSON.stringify(tempTsconfig, null, 2));

    return {
      context: { tempTsconfigPath },
      // No cleanup needed - each file has unique config, gets regenerated on next check
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
      // Normalize both paths to absolute for comparison
      // tsc outputs paths relative to the working directory (_projectRoot)
      const normalizedFilePath = resolve(_projectRoot, filePath);
      const normalizedTargetFile = resolve(_file);

      if (normalizedFilePath !== normalizedTargetFile) {
        // Paths don't match - skip this diagnostic
        continue;
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

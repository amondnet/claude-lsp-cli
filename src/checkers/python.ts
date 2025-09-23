/**
 * Python Language Checker Configuration
 */

import { existsSync } from 'fs';
import { join } from 'path';
import type { LanguageConfig } from '../language-checker-registry';
import { mapSeverity, shouldSkipDiagnostic } from '../language-checker-registry';

export const pythonConfig: LanguageConfig = {
  name: 'Python',
  tool: 'pyright',
  extensions: ['.py', '.pyi', '.pyw'],
  localPaths: [
    'node_modules/.bin/pyright',
    // Mise/rtx shims (most common on this system)
    '~/.local/share/mise/shims/pyright',
    // Common system installation paths
    '/usr/local/bin/pyright',
    '/usr/bin/pyright',
    // Homebrew
    '/opt/homebrew/bin/pyright',
    // asdf
    '~/.asdf/shims/pyright',
    // npm global install
    '~/.npm-global/bin/pyright',
    // Mise/rtx version-specific installations
    '~/.local/share/mise/installs/python/*/bin/pyright',
  ],

  buildArgs: (_file: string, _projectRoot: string, _toolCommand: string, _context?: any) => {
    const args = ['--outputjson'];

    // Check for Python project configuration
    const hasPyrightConfig = existsSync(join(_projectRoot, 'pyrightconfig.json'));
    const hasPyprojectToml = existsSync(join(_projectRoot, 'pyproject.toml'));

    if (hasPyrightConfig || hasPyprojectToml) {
      // Use project configuration
      args.push('--project', _projectRoot);
    }

    args.push(_file);
    return args;
  },

  parseOutput: (stdout: string, stderr: string, _file: string, _projectRoot: string) => {
    const diagnostics: Array<{
      line: number;
      column: number;
      severity: 'error' | 'warning' | 'info';
      message: string;
    }> = [];

    if (!stdout.trim() && !stderr.trim()) return diagnostics;

    // Pyright outputs JSON when using --outputjson
    try {
      const result = JSON.parse(stdout);

      if (result.generalDiagnostics) {
        for (const diag of result.generalDiagnostics) {
          const message = diag.message;

          // Skip if this diagnostic should be filtered
          if (shouldSkipDiagnostic(message, _file)) {
            continue;
          }

          diagnostics.push({
            line: diag.range?.start?.line ? diag.range.start.line + 1 : 1,
            column: diag.range?.start?.character ? diag.range.start.character + 1 : 1,
            severity: mapSeverity(diag.severity || 'error'),
            message: message.trim(),
          });
        }
      }
    } catch (error) {
      // Fallback: try to parse as text output
      if (stderr) {
        const lines = stderr.split('\n');
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;

          // Skip common noise
          if (
            trimmed.includes('Try "python -m pip install') ||
            trimmed.includes('reportMissingImports')
          ) {
            continue;
          }

          // Basic text parsing for error messages
          const match = trimmed.match(/(\d+):(\d+)\s+-\s+(error|warning|info):\s*(.+)/);
          if (match) {
            const [, lineStr, colStr, severity, message] = match;

            if (message && shouldSkipDiagnostic(message, _file)) {
              continue;
            }

            diagnostics.push({
              line: parseInt(lineStr || '1', 10),
              column: parseInt(colStr || '1', 10),
              severity: mapSeverity(severity || 'error'),
              message: (message || 'Unknown error').trim(),
            });
          }
        }
      }
    }

    return diagnostics;
  },

  detectConfig: (_projectRoot: string) => {
    return (
      existsSync(join(_projectRoot, 'pyrightconfig.json')) ||
      existsSync(join(_projectRoot, 'pyproject.toml')) ||
      existsSync(join(_projectRoot, 'requirements.txt')) ||
      existsSync(join(_projectRoot, 'Pipfile'))
    );
  },

  setupCommand: async (_file: string, _projectRoot: string) => {
    // Set up PYTHONPATH to help resolve local imports
    const pythonPath = [
      _projectRoot,
      join(_projectRoot, 'src'),
      join(_projectRoot, 'lib'),
      process.env.PYTHONPATH || '',
    ]
      .filter((p) => p)
      .join(':');

    return {
      context: {
        env: {
          PATH: process.env.PATH || '',
          PYTHONPATH: pythonPath,
        },
      },
    };
  },
};

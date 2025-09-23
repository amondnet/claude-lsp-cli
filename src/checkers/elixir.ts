/**
 * Elixir Language Checker Configuration
 */

import { existsSync } from 'fs';
import { join } from 'path';
import type { LanguageConfig } from '../language-checker-registry';
import type { DiagnosticResult } from '../types/DiagnosticResult';

export const elixirConfig: LanguageConfig = {
  name: 'Elixir',
  tool: 'elixirc',
  extensions: ['.ex', '.exs'],
  localPaths: [
    // Common system paths
    '/usr/local/bin/elixirc',
    '/usr/bin/elixirc',
    // GitHub Actions setup-beam default paths
    '/home/runner/work/_temp/.setup-beam/elixir/bin/elixirc',
    // Common local Elixir installation paths
    '~/.asdf/shims/elixirc',
    '~/.kiex/elixirs/*/bin/elixirc',
  ],

  detectConfig: (projectRoot: string) => {
    return existsSync(join(projectRoot, 'mix.exs'));
  },

  setupCommand: async (_file: string, projectRoot: string) => {
    // For Mix projects, use mix compile
    if (existsSync(join(projectRoot, 'mix.exs'))) {
      const { runCommand } = await import('../utils/common');
      await runCommand(['mix', 'clean'], undefined, projectRoot);
      return {
        context: {
          hasMixProject: true,
          tool: 'mix',
          args: ['compile', '--warnings-as-errors'],
        },
      };
    }
    // For standalone files, use elixirc
    return {
      context: {
        hasMixProject: false,
        tool: 'elixirc',
        args: [],
      },
    };
  },

  buildArgs: (_file: string, _projectRoot: string, _toolCommand: string, context?: any) => {
    if (context?.hasMixProject) {
      return {
        tool: 'mix',
        args: ['compile', '--warnings-as-errors'],
      };
    } else {
      // For standalone files, compile directly
      return ['--warnings-as-errors', _file];
    }
  },

  parseOutput: (_stdout: string, stderr: string, _file: string, _projectRoot: string) => {
    const diagnostics: DiagnosticResult[] = [];
    const lines = stderr.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line) continue;

      // Match the new error format: "error: message" followed by location
      if (line.trim().startsWith('error:') || line.trim().startsWith('warning:')) {
        const isError = line.trim().startsWith('error:');
        const message = line.replace(/^\s*(error|warning):\s*/, '').trim();

        // Look for location info in subsequent lines
        for (let j = i + 1; j < lines.length && j < i + 10; j++) {
          const locationLine = lines[j];
          if (!locationLine) continue;

          // Try new format with tree characters: └─ path:line:column
          const newLocationMatch = locationLine.match(/└─\s+(.+?):(\d+):(\d+)/);
          if (newLocationMatch && newLocationMatch[2] && newLocationMatch[3]) {
            diagnostics.push({
              line: parseInt(newLocationMatch[2]),
              column: parseInt(newLocationMatch[3]),
              severity: isError ? ('error' as const) : ('warning' as const),
              message: message,
            });
            break;
          }

          // Try standard format: "  path:line: context"
          const standardLocationMatch = locationLine.match(/^\s+(.+?):(\d+):\s/);
          if (standardLocationMatch) {
            diagnostics.push({
              line: standardLocationMatch[2] ? parseInt(standardLocationMatch[2], 10) : 1,
              column: 1,
              severity: isError ? ('error' as const) : ('warning' as const),
              message: message,
            });
            break;
          }
        }
      }

      // Also match the old format for backward compatibility
      const oldMatch = line.match(
        /\*\* \((CompileError|SyntaxError|warning)\) (.+?):(\d+):?\s*(.+)/
      );
      if (oldMatch) {
        const isError = oldMatch[1] !== 'warning';
        diagnostics.push({
          line: oldMatch[3] ? parseInt(oldMatch[3], 10) : 1,
          column: 1,
          severity: isError ? ('error' as const) : ('warning' as const),
          message: oldMatch[4] || 'Unknown error',
        });
      }
    }

    return diagnostics;
  },
};

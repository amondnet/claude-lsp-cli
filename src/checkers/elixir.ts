/**
 * Elixir Language Checker Configuration
 */

import { relative } from 'path';
import type { LanguageConfig } from '../language-checker-registry.js';

export const elixirConfig: LanguageConfig = {
  name: 'Elixir',
  tool: 'elixir',
  extensions: ['.ex', '.exs'],
  localPaths: [], // Elixir is usually system-installed

  buildArgs: (_file: string, _projectRoot: string, _toolCommand: string) => {
    const relativePath = relative(_projectRoot, _file);
    return [relativePath];
  },

  parseOutput: (stdout: string, stderr: string, _file: string, _projectRoot: string) => {
    const diagnostics = [];
    const lines = stderr.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Match the new error format: "error: message" followed by location
      if (line.trim().startsWith('error:') || line.trim().startsWith('warning:')) {
        const isError = line.trim().startsWith('error:');
        const message = line.replace(/^\s*(error|warning):\s*/, '').trim();

        // Look for location info in subsequent lines
        for (let j = i + 1; j < lines.length && j < i + 10; j++) {
          const locationLine = lines[j];
          const locationMatch = locationLine.match(/└─\s+(.+?):(\d+):(\d+):/);
          if (locationMatch) {
            diagnostics.push({
              line: parseInt(locationMatch[2]),
              column: parseInt(locationMatch[3]),
              severity: isError ? ('error' as const) : ('warning' as const),
              message: message,
            });
            break;
          }
        }
      }

      // Also match the old format for backward compatibility
      const oldMatch = line.match(/\*\* \((CompileError|SyntaxError|warning)\) (.+?):(\d+):?\s*(.+)/);
      if (oldMatch) {
        const isError = oldMatch[1] !== 'warning';
        diagnostics.push({
          line: parseInt(oldMatch[3]),
          column: 1,
          severity: isError ? ('error' as const) : ('warning' as const),
          message: oldMatch[4],
        });
      }
    }
    
    return diagnostics;
  }
};
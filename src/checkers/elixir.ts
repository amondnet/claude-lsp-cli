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

  buildArgs: (file: string, projectRoot: string, toolCommand: string) => {
    const relativePath = relative(projectRoot, file);
    return [toolCommand, relativePath];
  },

  parseOutput: (stdout: string, stderr: string, file: string, projectRoot: string) => {
    const diagnostics = [];
    const lines = stderr.split('\n');
    
    for (const line of lines) {
      // Match the new error format: "error: message" followed by location
      if (line.trim().startsWith('error:')) {
        const errorMessage = line.replace(/^\s*error:\s*/, '');

        // Look for location info in subsequent lines
        for (let i = lines.indexOf(line) + 1; i < lines.length; i++) {
          const locationLine = lines[i];
          const locationMatch = locationLine.match(/└─\s+(.+?):(\d+):(\d+):/);
          if (locationMatch) {
            diagnostics.push({
              line: parseInt(locationMatch[2]),
              column: parseInt(locationMatch[3]),
              severity: 'error' as const,
              message: errorMessage,
            });
            break;
          }
        }
      }

      // Also match the old format for backward compatibility
      const oldMatch = line.match(/\*\* \((CompileError|SyntaxError)\) (.+?):(\d+): (.+)/);
      if (oldMatch) {
        diagnostics.push({
          line: parseInt(oldMatch[3]),
          column: 1,
          severity: 'error' as const,
          message: oldMatch[4],
        });
      }
    }
    
    return diagnostics;
  }
};
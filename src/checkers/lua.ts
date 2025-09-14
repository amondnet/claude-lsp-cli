/**
 * Lua Language Checker Configuration
 */

import { relative } from 'path';
import type { LanguageConfig } from '../language-checker-registry';
import type { DiagnosticResult } from '../types/DiagnosticResult';

export const luaConfig: LanguageConfig = {
  name: 'Lua',
  tool: 'luac',
  extensions: ['.lua'],
  localPaths: [], // Lua is usually system-installed

  buildArgs: (_file: string, _projectRoot: string, _toolCommand: string) => {
    const relativePath = relative(_projectRoot, _file);
    return ['-p', relativePath];
  },

  parseOutput: (stdout: string, stderr: string, _file: string, _projectRoot: string) => {
    const diagnostics: DiagnosticResult[] = [];
    const lines = stderr.split('\n');

    for (const line of lines) {
      // Parse luac output format: luac: file.lua:line: message
      const match = line.match(/luac: .+?:(\d+): (.+)/);
      if (match) {
        diagnostics.push({
          line: parseInt(match[1]),
          column: 1,
          severity: 'error' as const,
          message: match[2],
        });
      }
    }

    return diagnostics;
  },
};

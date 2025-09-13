/**
 * Go Language Checker Configuration
 */

import { existsSync } from 'fs';
import { join } from 'path';
import type { LanguageConfig } from '../language-checker-registry.js';
import type { DiagnosticResult } from '../types/DiagnosticResult';

export const goConfig: LanguageConfig = {
  name: 'Go',
  tool: 'go',
  extensions: ['.go'],
  localPaths: [], // Go is usually system-installed

  detectConfig: (_projectRoot: string) => {
    return existsSync(join(_projectRoot, 'go.mod'));
  },

  buildArgs: (file: string, _projectRoot: string, _toolCommand: string, _context?: any) => {
    // Use go build for better error detection than go vet
    return ['build', file];
  },

  parseOutput: (stdout: string, stderr: string, _file: string, _projectRoot: string) => {
    const diagnostics: DiagnosticResult[] = [];
    const lines = stderr.split('\n');
    
    for (const line of lines) {
      const match = line.match(/^.+?:(\d+):(\d+): (.+)$/);
      if (match) {
        diagnostics.push({
          line: parseInt(match[1]),
          column: parseInt(match[2]),
          severity: 'error' as const,
          message: match[3],
        });
      }
    }
    
    return diagnostics;
  },

  setupCommand: async (_file: string, _projectRoot: string) => {
    const hasGoMod = existsSync(join(_projectRoot, 'go.mod'));
    return {
      context: { hasGoMod }
    };
  }
};
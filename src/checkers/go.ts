/**
 * Go Language Checker Configuration
 */

import { existsSync } from 'fs';
import { join } from 'path';
import type { LanguageConfig } from '../language-checker-registry.js';
import { mapSeverity, stripAnsiCodes } from '../language-checker-registry.js';

export const goConfig: LanguageConfig = {
  name: 'Go',
  tool: 'go',
  extensions: ['.go'],
  localPaths: [], // Go is usually system-installed

  detectConfig: (projectRoot: string) => {
    return existsSync(join(projectRoot, 'go.mod'));
  },

  buildArgs: (file: string, projectRoot: string, toolCommand: string, context?: any) => {
    const hasGoMod = context?.hasGoMod || existsSync(join(projectRoot, 'go.mod'));
    
    if (hasGoMod) {
      return [toolCommand, 'vet', file];
    } else {
      return [toolCommand, 'vet', file];
    }
  },

  parseOutput: (stdout: string, stderr: string, file: string, projectRoot: string) => {
    const diagnostics = [];
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

  setupCommand: async (file: string, projectRoot: string) => {
    const hasGoMod = existsSync(join(projectRoot, 'go.mod'));
    return {
      context: { hasGoMod }
    };
  }
};
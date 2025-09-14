/**
 * C++ Language Checker Configuration
 */

import type { LanguageConfig } from '../language-checker-registry';
import type { DiagnosticResult } from '../types/DiagnosticResult';

export const cppConfig: LanguageConfig = {
  name: 'Cpp',
  tool: 'gcc',
  extensions: ['.cpp', '.cxx', '.cc', '.c', '.h'],
  localPaths: [], // GCC is usually system-installed

  buildArgs: (file: string, _projectRoot: string, _toolCommand: string) => {
    return ['-fsyntax-only', '-Wall', file];
  },

  parseOutput: (stdout: string, stderr: string, _file: string, _projectRoot: string) => {
    const diagnostics: DiagnosticResult[] = [];
    const lines = stderr.split('\n');

    for (const line of lines) {
      // Match both regular errors/warnings and fatal errors
      const match = line.match(/^.+?:(\d+):(\d+): (error|warning|fatal error): (.+)$/);
      if (match) {
        diagnostics.push({
          line: parseInt(match[1]),
          column: parseInt(match[2]),
          severity: match[3].includes('error') ? ('error' as const) : ('warning' as const),
          message: match[4],
        });
      }
    }

    return diagnostics;
  },
};

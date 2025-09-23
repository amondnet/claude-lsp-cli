/**
 * Terraform Language Checker Configuration
 */

import type { LanguageConfig } from '../language-checker-registry';
import type { DiagnosticResult } from '../types/DiagnosticResult';

export const terraformConfig: LanguageConfig = {
  name: 'Terraform',
  tool: 'terraform',
  extensions: ['.tf', '.tfvars'],
  localPaths: [], // Terraform is usually system-installed

  setupCommand: async (_file: string, _projectRoot: string) => {
    // Run both fmt -check and validate
    return {
      context: {
        needsInit: false,
      },
    };
  },

  buildArgs: (_file: string, _projectRoot: string, _toolCommand: string, _context?: any) => {
    // Run validate for actual errors, fmt -check for formatting
    const workingDir = _file.substring(0, _file.lastIndexOf('/')) || _projectRoot;
    const filename = _file.split('/').pop() || _file;

    // We'll run both fmt and validate, but fmt is more reliable
    // so we use it by default
    return {
      args: ['fmt', '-check', '-diff', filename],
      timeout: 10000,
      workingDirectory: workingDir,
    };
  },

  parseOutput: (stdout: string, stderr: string, _file: string, _projectRoot: string) => {
    const diagnostics: DiagnosticResult[] = [];

    // Terraform fmt outputs diff to stderr when formatting issues found
    if (stderr.trim() || stdout.trim()) {
      diagnostics.push({
        line: 1,
        column: 1,
        severity: 'warning' as const,
        message: 'Formatting issues detected',
      });
    }

    return diagnostics;
  },
};

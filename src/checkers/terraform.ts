/**
 * Terraform Language Checker Configuration
 */

import { relative } from 'path';
import type { LanguageConfig } from '../language-checker-registry.js';

export const terraformConfig: LanguageConfig = {
  name: 'Terraform',
  tool: 'terraform',
  extensions: ['.tf'],
  localPaths: [], // Terraform is usually system-installed

  buildArgs: (_file: string, _projectRoot: string, _toolCommand: string) => {
    const relativePath = relative(_projectRoot, _file);
    return ['fmt', '-check', '-diff', relativePath];
  },

  parseOutput: (stdout: string, stderr: string, _file: string, _projectRoot: string) => {
    const diagnostics = [];
    
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
  }
};
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

  buildArgs: (file: string, projectRoot: string, toolCommand: string) => {
    const relativePath = relative(projectRoot, file);
    return [toolCommand, 'fmt', '-check', '-diff', relativePath];
  },

  parseOutput: (stdout: string, stderr: string, file: string, projectRoot: string) => {
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
/**
 * PHP Language Checker Configuration
 */

import { existsSync } from 'fs';
import { join, relative } from 'path';
import type { LanguageConfig } from '../language-checker-registry.js';
import { mapSeverity, stripAnsiCodes } from '../language-checker-registry.js';

export const phpConfig: LanguageConfig = {
  name: 'Php',
  tool: 'php',
  extensions: ['.php'],
  localPaths: [], // PHP is usually system-installed

  detectConfig: (projectRoot: string) => {
    return existsSync(join(projectRoot, 'composer.json'));
  },

  buildArgs: (file: string, projectRoot: string, toolCommand: string, context?: any) => {
    const relativePath = relative(projectRoot, file);
    const args = [];
    
    const hasComposerJson = context?.hasComposerJson;
    const hasVendorAutoload = context?.hasVendorAutoload;
    
    if (hasComposerJson && hasVendorAutoload) {
      // Include Composer autoloader for better class resolution
      args.push('-d', `auto_prepend_file=${join(projectRoot, 'vendor', 'autoload.php')}`);
    }
    
    // Add lint flag and file
    args.push('-l', relativePath);
    return args;
  },

  parseOutput: (stdout: string, stderr: string, file: string, projectRoot: string) => {
    const diagnostics = [];
    const output = stderr + stdout;
    const lines = output.split('\n');
    
    for (const line of lines) {
      // Parse error format: "Parse error: message in file on line X"
      const parseMatch = line.match(/Parse error: (.+) in .+ on line (\d+)/);
      if (parseMatch) {
        diagnostics.push({
          line: parseInt(parseMatch[2]),
          column: 1,
          severity: 'error' as const,
          message: parseMatch[1],
        });
      }

      // Fatal error format: "Fatal error: message in file on line X"
      const fatalMatch = line.match(/Fatal error: (.+) in .+ on line (\d+)/);
      if (fatalMatch) {
        diagnostics.push({
          line: parseInt(fatalMatch[2]),
          column: 1,
          severity: 'error' as const,
          message: fatalMatch[1],
        });
      }

      // Warning format: "Warning: message in file on line X"
      const warningMatch = line.match(/Warning: (.+) in .+ on line (\d+)/);
      if (warningMatch) {
        diagnostics.push({
          line: parseInt(warningMatch[2]),
          column: 1,
          severity: 'warning' as const,
          message: warningMatch[1],
        });
      }
    }
    
    return diagnostics;
  },

  setupCommand: async (file: string, projectRoot: string) => {
    const hasComposerJson = existsSync(join(projectRoot, 'composer.json'));
    const hasVendorAutoload = existsSync(join(projectRoot, 'vendor', 'autoload.php'));
    
    return {
      context: { hasComposerJson, hasVendorAutoload }
    };
  }
};
/**
 * Rust Language Checker Configuration
 */

import { existsSync } from 'fs';
import { join, relative } from 'path';
import type { LanguageConfig } from '../language-checker-registry.js';
import { mapSeverity, stripAnsiCodes } from '../language-checker-registry.js';

export const rustConfig: LanguageConfig = {
  name: 'Rust',
  tool: 'cargo',
  extensions: ['.rs'],
  localPaths: [], // Rust tools are usually system-installed

  detectConfig: (projectRoot: string) => {
    return existsSync(join(projectRoot, 'Cargo.toml'));
  },

  buildArgs: (file: string, projectRoot: string, toolCommand: string, context?: any) => {
    const hasCargoToml = context?.hasCargoToml;
    
    if (hasCargoToml) {
      return ['cargo', 'check', '--message-format=json'];
    } else {
      const relativePath = relative(projectRoot, file);
      return ['rustc', '--error-format=json', '--edition', '2021', relativePath];
    }
  },

  parseOutput: (stdout: string, stderr: string, file: string, projectRoot: string) => {
    const diagnostics = [];
    const output = stdout || stderr;
    const lines = output.split('\n');
    
    for (const line of lines) {
      if (!line.trim()) continue;
      
      try {
        const parsed = JSON.parse(line);
        
        if (parsed.message && parsed.message.spans) {
          for (const span of parsed.message.spans) {
            // Check if this diagnostic is for our target file
            if (span.file_name && span.file_name.includes(file.split('/').pop())) {
              const severity = mapSeverity(parsed.message.level || 'error');
              
              diagnostics.push({
                line: span.line_start || 1,
                column: span.column_start || 1,
                severity,
                message: parsed.message.message || 'Unknown error',
              });
            }
          }
        }
      } catch (e) {
        // Not JSON, try to parse as plain text error
        const match = line.match(/error(?:\[E\d+\])?: (.+)/);
        if (match) {
          diagnostics.push({
            line: 1,
            column: 1,
            severity: 'error' as const,
            message: match[1],
          });
        }
      }
    }
    
    return diagnostics;
  },

  setupCommand: async (file: string, projectRoot: string) => {
    const hasCargoToml = existsSync(join(projectRoot, 'Cargo.toml'));
    return {
      context: { hasCargoToml }
    };
  }
};
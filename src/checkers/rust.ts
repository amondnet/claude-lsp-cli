/**
 * Rust Language Checker Configuration
 */

import { existsSync } from 'fs';
import { join, relative } from 'path';
import type { LanguageConfig } from '../language-checker-registry.js';
import { mapSeverity } from '../language-checker-registry.js';
import type { DiagnosticResult } from '../types/DiagnosticResult';

export const rustConfig: LanguageConfig = {
  name: 'Rust',
  tool: 'rustc', // Default to rustc, will be overridden in buildArgs if cargo project
  extensions: ['.rs'],
  localPaths: [], // Rust tools are usually system-installed

  detectConfig: (_projectRoot: string) => {
    return existsSync(join(_projectRoot, 'Cargo.toml'));
  },

  buildArgs: (_file: string, _projectRoot: string, _toolCommand: string, context?: any) => {
    const hasCargoToml = context?.hasCargoToml;
    
    if (hasCargoToml) {
      return { tool: 'cargo', args: ['check', '--message-format=json'] };
    } else {
      const relativePath = relative(_projectRoot, _file);
      return { tool: 'rustc', args: ['--error-format=json', '--edition', '2021', relativePath] };
    }
  },

  parseOutput: (stdout: string, stderr: string, file: string, _projectRoot: string) => {
    const diagnostics: DiagnosticResult[] = [];
    const output = stdout || stderr;
    const lines = output.split('\n');
    
    for (const line of lines) {
      if (!line.trim()) continue;
      
      try {
        const parsed = JSON.parse(line);
        
        // Handle cargo's format (nested message structure)
        if (parsed.reason === 'compiler-message' && parsed.message && parsed.message.spans) {
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
        // Handle rustc's format (direct spans)
        else if (parsed['$message_type'] === 'diagnostic' && parsed.message && parsed.spans) {
          for (const span of parsed.spans) {
            // Check if this diagnostic is for our target file
            if (span.file_name && span.file_name.includes(file.split('/').pop())) {
              const severity = mapSeverity(parsed.level || 'error');
              
              diagnostics.push({
                line: span.line_start || 1,
                column: span.column_start || 1,
                severity,
                message: parsed.message || 'Unknown error',
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

  setupCommand: async (_file: string, _projectRoot: string) => {
    const hasCargoToml = existsSync(join(_projectRoot, 'Cargo.toml'));
    return {
      context: { hasCargoToml }
    };
  }
};
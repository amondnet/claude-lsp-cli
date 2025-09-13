/**
 * Scala Language Checker Configuration
 */

import { existsSync, readdirSync, statSync } from 'fs';
import { join, dirname, basename, relative } from 'path';
import type { LanguageConfig } from '../language-checker-registry.js';
import { shouldSkipDiagnostic } from '../language-checker-registry.js';
import type { DiagnosticResult } from '../types/DiagnosticResult';

// Helper function to strip ANSI color codes
const stripAnsiCodes = (str: string): string => {
  // Use String.fromCharCode to avoid ESLint control character detection
  const escapeChar = String.fromCharCode(27); // ESC character (0x1B)
  const ansiPattern = new RegExp(`${escapeChar}\\[[0-9;]*m`, 'g');
  return str.replace(ansiPattern, '');
};

// Helper to extract detailed error message from subsequent lines
const extractDetailedMessage = (lines: string[], startIndex: number): string | null => {
  for (let j = startIndex + 1; j < Math.min(startIndex + 10, lines.length); j++) {
    const detailLine = stripAnsiCodes(lines[j]);

    // Check for common error patterns
    if (
      detailLine.includes('too many arguments') ||
      detailLine.includes('not a member of') ||
      detailLine.includes('Not found:') ||
      detailLine.includes('no pattern match extractor') ||
      (detailLine.includes('Found:') && detailLine.includes('Required:'))
    ) {
      return detailLine.replace(/^\s*\|\s*/, '').trim();
    }

    // Check for detail lines with pipe prefix
    const detailMatch = detailLine.match(/\s*\|\s*(.+)$/);
    if (detailMatch) {
      const content = detailMatch[1].trim();
      if (
        content &&
        !content.match(/^\^+$/) &&
        !content.match(/^(import|class|def|val|var|if|else|for|while|try|catch)\s/) &&
        (content.includes('not a member of') ||
          content.includes('Not found:') ||
          content.includes('cannot be applied'))
      ) {
        return content;
      }
    }
  }
  return null;
};

export const scalaConfig: LanguageConfig = {
  name: 'Scala',
  tool: 'scalac',
  extensions: ['.scala', '.sc'],
  localPaths: [], // Scala compiler is usually system-installed

  detectConfig: (_projectRoot: string) => {
    return existsSync(join(_projectRoot, 'build.sbt'));
  },

  buildArgs: (_file: string, _projectRoot: string, _toolCommand: string, context?: any) => {
    const args = ['-explain', '-nowarn'];
    const classpathParts = context?.classpathParts || [];
    const filesToCompile = context?.filesToCompile || [_file];

    if (classpathParts.length > 0) {
      args.push('-cp', classpathParts.join(':'));
    }

    args.push(...filesToCompile);
    return args;
  },

  parseOutput: (stdout: string, stderr: string, _file: string, _projectRoot: string) => {
    const diagnostics: DiagnosticResult[] = [];
    const lines = stderr.split('\n');
    const targetFileName = basename(_file);

    // Check for Scala 2.x format
    let isScala2Format = false;
    for (const line of lines) {
      if (line.match(/^\S+\.scala:\d+: (error|warning):/)) {
        isScala2Format = true;
        break;
      }
    }

    if (isScala2Format) {
      // Parse Scala 2.x format
      for (const line of lines) {
        const cleanLine = stripAnsiCodes(line);
        const scala2Match = cleanLine.match(/^(.+?):(\d+): (error|warning): (.+)$/);
        if (scala2Match) {
          const errorFile = basename(scala2Match[1]);
          if (errorFile === targetFileName) {
            diagnostics.push({
              line: parseInt(scala2Match[2]),
              column: 1,
              severity: scala2Match[3] as 'error' | 'warning',
              message: scala2Match[4],
            });
          }
        }
      }
    } else {
      // Parse Scala 3 format
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const cleanLine = stripAnsiCodes(line);

        const match = cleanLine.match(/-- (?:\[E\d+\] )?(.+): (.+?):(\d+):(\d+)/);
        if (match) {
          const errorFile = match[2];
          if (!errorFile.endsWith(targetFileName)) {
            continue;
          }

          let message = match[1];

          // Look for detailed error message in subsequent lines
          const detailedMessage = extractDetailedMessage(lines, i);
          if (detailedMessage) {
            message = detailedMessage;
          }

          const diagnostic = {
            line: parseInt(match[3]),
            column: parseInt(match[4]),
            severity: 'error' as const,
            message: message,
          };

          // Apply filtering for common false positives
          if (!shouldSkipDiagnostic(diagnostic.message, _file)) {
            diagnostics.push(diagnostic);
          }
        }
      }
    }

    return diagnostics;
  },

  setupCommand: async (_file: string, _projectRoot: string) => {
    const fileDir = dirname(_file);
    const scalaFilesInDir = readdirSync(fileDir).filter((f) => f.endsWith('.scala'));
    const isMultiFilePackage = scalaFilesInDir.length > 1;
    const hasBuildSbt = existsSync(join(_projectRoot, 'build.sbt'));

    // Build classpath
    const classpathParts: string[] = [];

    if (hasBuildSbt) {
      // Add common target directories for compiled classes
      const targetDirs = [
        'target/scala-3.3.1/classes',
        'target/scala-3.3.0/classes',
        'target/scala-3.4.3/classes',
        'target/scala-2.13/classes',
        'target/scala-2.12/classes',
        'core/jvm/target/scala-3.3.1/classes',
      ].map((dir) => join(_projectRoot, dir));

      for (const dir of targetDirs) {
        if (existsSync(dir)) {
          classpathParts.push(dir);
        }
      }
    }

    // Collect files to compile together
    const filesToCompile: string[] = [];
    if (isMultiFilePackage) {
      scalaFilesInDir.forEach((f) => {
        filesToCompile.push(join(fileDir, f));
      });
    } else {
      filesToCompile.push(_file);
    }

    return {
      context: { classpathParts, filesToCompile },
    };
  },
};

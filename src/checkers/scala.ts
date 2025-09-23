/**
 * Scala Language Checker Configuration
 */

import { existsSync, readdirSync } from 'fs';
import { join, basename } from 'path';
import type { LanguageConfig } from '../language-checker-registry';
import type { DiagnosticResult } from '../types/DiagnosticResult';
import { runCommand } from '../utils/common';

export const scalaConfig: LanguageConfig = {
  name: 'Scala',
  tool: 'scalac',
  extensions: ['.scala', '.sc'],
  localPaths: [
    // Common installation paths for scalac
    '/usr/local/bin/scalac',
    '/usr/bin/scalac',
    '~/.local/share/mise/installs/scala/*/bin/scalac',
    '~/.sdkman/candidates/scala/current/bin/scalac',
  ],

  detectConfig: (_projectRoot: string) => {
    return existsSync(join(_projectRoot, 'build.sbt'));
  },

  buildArgs: (_file: string, _projectRoot: string, _toolCommand: string, context?: any) => {
    // Only use Bloop - if not available, setupCommand will have set skipChecking
    if (context?.skipChecking) {
      return []; // Return empty args, won't be used anyway
    }

    // Use scalac for standalone files
    if (context?.tool === 'scalac') {
      return ['-deprecation', '-feature', _file];
    }

    // Bloop command: compile the whole project (better context)
    // We'll filter by file in parseOutput
    const projectName = context?.projectName || 'root';
    return {
      tool: 'bloop',
      args: ['compile', '--no-color', projectName],
      timeout: 15000, // 15 seconds timeout for Bloop
    };
  },

  parseOutput: (
    _stdout: string,
    stderr: string,
    _file: string,
    _projectRoot: string,
    context?: any
  ) => {
    const diagnostics: DiagnosticResult[] = [];
    const lines = stderr.split('\n');
    const targetFileName = basename(_file);

    // Check for timeout
    if (stderr.includes('Command timed out')) {
      diagnostics.push({
        line: 1,
        column: 1,
        severity: 'warning',
        message: 'Scala compilation timed out - consider running `bloop server` in background',
      });
      return diagnostics;
    }

    // Check if we're using scalac (not Bloop)
    if (context?.tool === 'scalac') {
      // Parse scalac output
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (!line) continue;

        // Skip JVM warnings
        if (line.includes('WARNING:') && line.includes('sun.misc.Unsafe')) continue;
        if (line.includes('will be removed in a future release')) continue;

        // Standard scalac format: file.scala:2:21: error: ...
        const stdMatch = line.match(/^(.+?):(\d+):(\d+):\s*(error|warning):\s*(.+)/);
        if (stdMatch && stdMatch[2] && stdMatch[3]) {
          const isError = stdMatch[4] === 'error';
          diagnostics.push({
            line: parseInt(stdMatch[2], 10),
            column: parseInt(stdMatch[3], 10),
            severity: isError ? ('error' as const) : ('warning' as const),
            message: stdMatch[5] || 'Scala compilation error',
          });
        }

        // Scala 3 format: -- [E007] Type Mismatch Error: file.scala:2:20
        const scala3Match = line.match(/^.*--\s*\[E\d+\]\s+(.+?):\s+(.+?):(\d+):(\d+)/);
        if (scala3Match && scala3Match[3] && scala3Match[4]) {
          // Get the error message from subsequent lines
          let message = scala3Match[1] || 'Scala compilation error';
          for (let j = i + 1; j < lines.length && j < i + 10; j++) {
            const msgLine = lines[j];
            if (msgLine && msgLine.includes('Found:')) {
              // Extract the Found/Required pattern
              const foundMatch = msgLine.match(/Found:\s+(.+)/);
              if (foundMatch) {
                let errorMsg = `Type mismatch: Found ${foundMatch[1]}`;
                // Look for Required on next line
                if (j + 1 < lines.length) {
                  const reqLine = lines[j + 1];
                  const reqMatch = reqLine?.match(/Required:\s+(.+)/);
                  if (reqMatch) {
                    errorMsg += `, Required ${reqMatch[1]}`;
                  }
                }
                message = errorMsg;
                break;
              }
            } else if (
              msgLine &&
              !msgLine.includes('|') &&
              msgLine.trim() &&
              !msgLine.includes('longer explanation')
            ) {
              message = msgLine.trim();
              break;
            }
          }
          diagnostics.push({
            line: parseInt(scala3Match[3], 10),
            column: parseInt(scala3Match[4], 10),
            severity: 'error' as const,
            message: message,
          });
        }
      }
    } else {
      // Parse Bloop output format: [E] [E15] file.scala:10:5
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (!line) continue;

        // Match: [E] [E15] src/main/scala/Main.scala:46:32
        const match = line.match(/\[E\]\s+\[E\d+\]\s+(.+?):(\d+):(\d+)/);
        if (match && match[1] && match[2] && match[3] && match[1].includes(targetFileName)) {
          // The error message is on line 2 after the [E] marker
          let message = 'Scala compilation error';

          // Bloop format has error on the line starting with [E] followed by spaces
          if (i + 1 < lines.length) {
            const errorLine = lines[i + 1];
            if (errorLine) {
              // Match lines like: [E]       value process is not a member of User
              const errorMatch = errorLine.match(/\[E\]\s+(.+)/);
              if (errorMatch && errorMatch[1]) {
                message = errorMatch[1].trim();
              }
            }
          }

          diagnostics.push({
            line: parseInt(match[2], 10),
            column: parseInt(match[3], 10),
            severity: 'error' as const,
            message: message,
          });
        }
      }
    }

    return diagnostics;
  },

  setupCommand: async (_file: string, _projectRoot: string) => {
    // Check if project has .bloop config
    const bloopConfigDir = join(_projectRoot, '.bloop');
    if (!existsSync(bloopConfigDir)) {
      // No Bloop config - fallback to scalac for standalone files
      return {
        context: {
          useBloop: false,
          tool: 'scalac',
        },
      };
    }

    // Check if bloop command is available
    const bloopCheck = await runCommand(['which', 'bloop'], undefined, _projectRoot, 5000);
    if (bloopCheck.stderr.includes('not found') || bloopCheck.stdout.trim() === '') {
      // Bloop not installed - fallback to scalac for standalone files
      return {
        context: {
          useBloop: false,
          tool: 'scalac',
        },
      };
    }

    // Find the project name from .bloop directory
    let projectName = 'root'; // default
    try {
      const bloopProjects = readdirSync(bloopConfigDir)
        .filter((f) => f.endsWith('.json'))
        .map((f) => f.replace('.json', ''));

      // Prefer 'root' if it exists, otherwise use the first project
      if (bloopProjects.includes('root')) {
        projectName = 'root';
      } else if (bloopProjects.length > 0 && bloopProjects[0]) {
        projectName = bloopProjects[0];
      }
    } catch (_e) {
      // Use default 'root' if we can't read the directory
    }

    // Bloop is available and configured
    return {
      context: { useBloop: true, tool: 'bloop', projectName },
    };
  },
};

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
  localPaths: [], // Scala compiler is usually system-installed

  detectConfig: (_projectRoot: string) => {
    return existsSync(join(_projectRoot, 'build.sbt'));
  },

  buildArgs: (_file: string, _projectRoot: string, _toolCommand: string, context?: any) => {
    // Only use Bloop - if not available, setupCommand will have set skipChecking
    if (context?.skipChecking) {
      return []; // Return empty args, won't be used anyway
    }

    // Bloop command: compile the whole project (better context)
    // We'll filter by file in parseOutput
    const projectName = context?.projectName || 'root';
    return {
      tool: 'bloop',
      args: ['compile', '--no-color', projectName],
    };
  },

  parseOutput: (
    _stdout: string,
    stderr: string,
    _file: string,
    _projectRoot: string,
    _context?: any
  ) => {
    const diagnostics: DiagnosticResult[] = [];
    const lines = stderr.split('\n');
    const targetFileName = basename(_file);

    // Parse Bloop output format: [E] [E15] file.scala:10:5
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Match: [E] [E15] src/main/scala/Main.scala:46:32
      const match = line.match(/\[E\]\s+\[E\d+\]\s+(.+?):(\d+):(\d+)/);
      if (match && match[1].includes(targetFileName)) {
        // The error message is on line 2 after the [E] marker
        let message = 'Scala compilation error';

        // Bloop format has error on the line starting with [E] followed by spaces
        if (i + 1 < lines.length) {
          const errorLine = lines[i + 1];
          // Match lines like: [E]       value process is not a member of User
          const errorMatch = errorLine.match(/\[E\]\s+(.+)/);
          if (errorMatch) {
            message = errorMatch[1].trim();
          }
        }

        diagnostics.push({
          line: parseInt(match[2]),
          column: parseInt(match[3]),
          severity: 'error',
          message: message,
        });
      }
    }

    return diagnostics;
  },

  setupCommand: async (_file: string, _projectRoot: string) => {
    // Check if project has .bloop config
    const bloopConfigDir = join(_projectRoot, '.bloop');
    if (!existsSync(bloopConfigDir)) {
      // No Bloop config - skip checking
      return {
        context: { skipChecking: true },
      };
    }

    // Check if bloop command is available
    const bloopCheck = await runCommand(['which', 'bloop'], undefined, _projectRoot);
    if (bloopCheck.stderr.includes('not found') || bloopCheck.stdout.trim() === '') {
      // Bloop not installed - skip checking
      return {
        context: { skipChecking: true },
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
      } else if (bloopProjects.length > 0) {
        projectName = bloopProjects[0];
      }
    } catch (_e) {
      // Use default 'root' if we can't read the directory
    }

    // Bloop is available and configured
    return {
      context: { tool: 'bloop', projectName },
    };
  },
};

/**
 * Java Language Checker Configuration
 */

import { existsSync, readdirSync, statSync } from 'fs';
import { join, relative, dirname } from 'path';
import type { LanguageConfig } from '../language-checker-registry';
import type { DiagnosticResult } from '../types/DiagnosticResult';

function findJavaClasspath(_projectRoot: string): string[] {
  const classpath: string[] = [];

  // Add project root for package structure
  classpath.push(_projectRoot);

  // Look for Maven structure
  const mavenTarget = join(_projectRoot, 'target', 'classes');
  if (existsSync(mavenTarget)) {
    classpath.push(mavenTarget);
  }

  // Look for Gradle structure
  const gradleBuild = join(_projectRoot, 'build', 'classes', 'main');
  if (existsSync(gradleBuild)) {
    classpath.push(gradleBuild);
  }

  // Look for lib directory with JAR files
  const libDir = join(_projectRoot, 'lib');
  if (existsSync(libDir)) {
    try {
      const files = readdirSync(libDir);
      for (const file of files) {
        if (file.endsWith('.jar')) {
          classpath.push(join(libDir, file));
        }
      }
    } catch (e) {
      // Ignore errors reading lib directory
    }
  }

  return classpath;
}

export const javaConfig: LanguageConfig = {
  name: 'Java',
  tool: 'javac',
  extensions: ['.java'],
  localPaths: [], // Java is usually system-installed

  detectConfig: (_projectRoot: string) => {
    return (
      existsSync(join(_projectRoot, 'pom.xml')) ||
      existsSync(join(_projectRoot, 'build.gradle')) ||
      existsSync(join(_projectRoot, 'build.gradle.kts'))
    );
  },

  buildArgs: (file: string, _projectRoot: string, _toolCommand: string, context?: any) => {
    const classpath = context?.classpath || [];
    const args = ['-cp', classpath.join(':'), '-Xlint:all'];

    // Just syntax check, don't generate class files
    args.push('-proc:none');
    args.push(file);

    return args;
  },

  parseOutput: (stdout: string, stderr: string, file: string, _projectRoot: string) => {
    const diagnostics: DiagnosticResult[] = [];
    const output = stderr || stdout;
    const lines = output.split('\n');

    for (const line of lines) {
      // Java compiler format: "filename:line: error/warning: message"
      const match = line.match(/^(.+?):(\d+): (error|warning): (.+)$/);
      if (match && match[1] && match[2] && match[3] && match[4]) {
        const matchedFile = match[1];

        // Check if this error is for our target file
        if (matchedFile === file || matchedFile.endsWith(file.split('/').pop() || '')) {
          diagnostics.push({
            line: parseInt(match[2]),
            column: 1, // Java compiler doesn't always provide column info
            severity: match[3] as 'error' | 'warning',
            message: match[4],
          });
        }
      }

      // Handle compilation errors without line numbers
      const errorMatch = line.match(/^(.+?): (.+)$/);
      if (errorMatch && line.includes('error') && !line.includes(':')) {
        diagnostics.push({
          line: 1,
          column: 1,
          severity: 'error' as const,
          message: errorMatch[2] || errorMatch[1],
        });
      }
    }

    return diagnostics;
  },

  setupCommand: async (_file: string, _projectRoot: string) => {
    const classpath = findJavaClasspath(_projectRoot);
    return {
      context: { classpath },
    };
  },
};

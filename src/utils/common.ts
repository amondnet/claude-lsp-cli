/**
 * Common utilities shared across the codebase
 * Consolidates duplicate functions and shared logic
 */

import { spawn } from 'bun';
import { existsSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { homedir } from 'os';

/**
 * Run command with timeout and automatic kill
 * Consolidated from file-checker.ts and generic-checker.ts
 */
export async function runCommand(
  args: string[],
  env?: Record<string, string>,
  cwd?: string,
  timeoutMs?: number // Optional timeout parameter
): Promise<{ stdout: string; stderr: string; timedOut: boolean }> {
  const actualTimeout = timeoutMs ?? 30000; // Default 30 second timeout
  const proc = spawn(args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: env ? { ...process.env, ...env } : process.env,
    cwd: cwd || process.cwd(),
  });

  // Set up timeout
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => {
      proc.kill('SIGTERM');
      reject(new Error('Command timed out'));
    }, actualTimeout);
  });

  try {
    const result = await Promise.race([
      Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
        proc.exited,
      ]),
      timeoutPromise,
    ]);

    const [stdout, stderr] = result as [string, string, number];
    return { stdout, stderr, timedOut: false };
  } catch (error) {
    if (error instanceof Error && error.message === 'Command timed out') {
      return { stdout: '', stderr: 'Command timed out', timedOut: true };
    }
    return { stdout: '', stderr: String(error), timedOut: false };
  }
}

/**
 * Helper function to read global LSP config
 * Consolidated from file-checker.ts and generic-checker.ts
 */
export function readLspConfig(): Record<string, unknown> {
  // Only use global config
  const globalConfigPath = join(homedir(), '.claude', 'lsp-config.json');

  if (existsSync(globalConfigPath)) {
    try {
      return JSON.parse(readFileSync(globalConfigPath, 'utf8'));
    } catch {
      return {};
    }
  }

  return {};
}

/**
 * Check if a language is disabled in the configuration
 * Consolidated from file-checker.ts and generic-checker.ts
 */
export function isLanguageDisabled(_projectRoot: string, language: string): boolean {
  const config = readLspConfig();

  // Check global disable
  if (config.disable === true) {
    return true;
  }

  // Check language-specific disable
  const langKey = `disable${language}`;
  return config[langKey] === true;
}

/**
 * Find the nearest tsconfig.json for TypeScript configuration
 * Consolidated from file-checker.ts and checkers/typescript.ts
 */
export function findTsconfigRoot(filePath: string): string | null {
  let dir = dirname(filePath);

  while (dir !== '/' && dir.length > 1) {
    if (existsSync(join(dir, 'tsconfig.json'))) {
      return dir;
    }
    dir = dirname(dir);
  }

  return null; // No tsconfig.json found
}

/**
 * Find project root by looking for common project markers
 * Consolidated from file-checker.ts
 */
export function findProjectRoot(filePath: string): string {
  const dir = dirname(filePath);

  // First look for language-specific project files (more specific)
  let searchDir = dir;
  while (searchDir !== '/' && searchDir.length > 1) {
    if (
      existsSync(join(searchDir, 'package.json')) ||
      existsSync(join(searchDir, 'Cargo.toml')) ||
      existsSync(join(searchDir, 'go.mod')) ||
      existsSync(join(searchDir, 'pyproject.toml')) ||
      existsSync(join(searchDir, 'pom.xml')) ||
      existsSync(join(searchDir, 'build.gradle')) ||
      existsSync(join(searchDir, 'build.sbt')) // Scala SBT projects
    ) {
      return searchDir;
    }
    const parentDir = dirname(searchDir);
    if (parentDir === searchDir) break;
    searchDir = parentDir;
  }

  // Fall back to .git if no language-specific project found
  searchDir = dir;
  while (searchDir !== '/' && searchDir.length > 1) {
    if (existsSync(join(searchDir, '.git'))) {
      return searchDir;
    }

    const parentDir = dirname(searchDir);
    if (parentDir === searchDir) break;
    searchDir = parentDir;
  }

  // Return the file's directory if no project root found
  return dirname(filePath);
}

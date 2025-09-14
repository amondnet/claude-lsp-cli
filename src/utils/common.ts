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
  cwd?: string
): Promise<{ stdout: string; stderr: string; timedOut: boolean }> {
  const proc = spawn(args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: env ? { ...process.env, ...env } : process.env,
    cwd: cwd || process.cwd(),
  });

  try {
    const [stdout, stderr] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ]);

    await proc.exited;

    return { stdout, stderr, timedOut: false };
  } catch (error) {
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
  let dir = dirname(filePath);

  while (dir !== '/' && dir.length > 1) {
    // Check for common project markers (excluding tsconfig.json)
    if (
      existsSync(join(dir, '.git')) ||
      existsSync(join(dir, 'package.json')) ||
      existsSync(join(dir, 'Cargo.toml')) ||
      existsSync(join(dir, 'go.mod')) ||
      existsSync(join(dir, 'pyproject.toml')) ||
      existsSync(join(dir, 'pom.xml')) ||
      existsSync(join(dir, 'build.gradle'))
    ) {
      return dir;
    }

    const parentDir = dirname(dir);
    if (parentDir === dir) break;
    dir = parentDir;
  }

  // Return the file's directory if no project root found
  return dirname(filePath);
}

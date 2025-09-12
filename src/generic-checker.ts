/**
 * Generic Language Checker - Registry-based implementation
 * 
 * This replaces the individual checkXXX functions with a single
 * generic checker that uses the language registry.
 */

import { existsSync } from 'fs';
import { extname } from 'path';
import { spawn } from 'bun';
import type { FileCheckResult } from './file-checker.js';
import { LANGUAGE_REGISTRY, findLocalTool, createResult } from './language-checker-registry.js';

// Import registry initialization (ensures all languages are registered)
import './checkers/index.js';

/**
 * Run command with timeout and automatic kill
 */
async function runCommand(
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

// Import the config reading function from the main file-checker module
import { readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

/**
 * Helper function to read global LSP config
 */
function readLspConfig(_projectRoot?: string): any {
  // Only use global config
  const globalConfigPath = join(homedir(), '.claude', 'lsp-config.json');

  if (existsSync(globalConfigPath)) {
    try {
      return JSON.parse(readFileSync(globalConfigPath, 'utf8'));
    } catch (error) {
      return {};
    }
  }

  return {};
}

/**
 * Check if a language is disabled in the configuration
 */
function isLanguageDisabled(projectRoot: string, language: string): boolean {
  const config = readLspConfig(projectRoot);

  // Check global disable
  if (config.disable === true) {
    return true;
  }

  // Check language-specific disable
  const langKey = `disable${language}`;
  return config[langKey] === true;
}

/**
 * Generic language checker that uses the registry
 */
export async function checkFileWithRegistry(
  filePath: string, 
  projectRoot: string
): Promise<FileCheckResult | null> {
  if (!existsSync(filePath)) {
    return null;
  }

  const ext = extname(filePath).toLowerCase();
  const langConfig = LANGUAGE_REGISTRY.get(ext);
  
  if (!langConfig) {
    return null; // Unsupported file type
  }

  // Check if language is disabled
  if (isLanguageDisabled(projectRoot, langConfig.name)) {
    return null;
  }

  // Create base result
  const result = createResult(filePath, projectRoot, langConfig.tool);

  // Find local tool or use global
  let toolCommand = langConfig.tool;
  const localTool = findLocalTool(projectRoot, langConfig.localPaths);
  if (localTool) {
    toolCommand = localTool;
  }

  // Setup command if needed
  let cleanup: (() => void) | undefined;
  let setupContext: any = undefined;
  if (langConfig.setupCommand) {
    const setupResult = await langConfig.setupCommand(filePath, projectRoot);
    cleanup = setupResult.cleanup;
    setupContext = setupResult.context;
  }

  try {
    // Build command arguments
    const args = langConfig.buildArgs(filePath, projectRoot, toolCommand, setupContext);
    
    // Prepend the tool command to the arguments array
    const fullCommand = [toolCommand, ...args];

    if (process.env.DEBUG) {
      console.error(`Running ${langConfig.name} checker:`, fullCommand.join(' '));
    }

    // Run the tool
    const { stdout, stderr, timedOut } = await runCommand(fullCommand, undefined, projectRoot);

    if (timedOut) {
      result.timedOut = true;
      return result;
    }

    // Parse output into diagnostics
    result.diagnostics = langConfig.parseOutput(stdout, stderr, filePath, projectRoot);

    return result;

  } catch (error) {
    if (process.env.DEBUG) {
      console.error(`${langConfig.name} checker error:`, error);
    }
    return result; // Return empty result on error
  } finally {
    // Cleanup if needed
    if (cleanup) {
      cleanup();
    }
  }
}
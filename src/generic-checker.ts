/**
 * Generic Language Checker - Registry-based implementation
 *
 * This replaces the individual checkXXX functions with a single
 * generic checker that uses the language registry.
 */

import { existsSync } from 'fs';
import { extname } from 'path';
import type { FileCheckResult } from './file-checker';
import { LANGUAGE_REGISTRY, findLocalTool, createResult } from './language-checker-registry';
import { runCommand, isLanguageDisabled } from './utils/common';

// Import registry initialization (ensures all languages are registered)
import './checkers/index';

// runCommand, readLspConfig, and isLanguageDisabled are now imported from utils/common

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
    // If registry is empty or doesn't have this extension, return null
    // This will cause fallback to legacy implementation
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
  let setupContext: Record<string, unknown> | undefined = undefined;
  if (langConfig.setupCommand) {
    const setupResult = await langConfig.setupCommand(filePath, projectRoot);
    cleanup = setupResult.cleanup;
    setupContext = setupResult.context as Record<string, unknown> | undefined;

    // Check if we should skip checking (e.g., Scala without Bloop)
    if (setupContext?.skipChecking) {
      return null; // Return null to indicate no checking performed
    }
  }

  try {
    // Build command arguments
    const buildResult = langConfig.buildArgs(filePath, projectRoot, toolCommand, setupContext);

    // Handle both old array format and new object format
    let finalTool = toolCommand;
    let args: string[];
    let timeout: number | undefined;

    if (Array.isArray(buildResult)) {
      args = buildResult;
    } else {
      finalTool = buildResult.tool || toolCommand;
      args = buildResult.args;
      timeout = buildResult.timeout;
      // Update result tool if a different tool is being used
      if (buildResult.tool) {
        result.tool = buildResult.tool;
      }
    }

    // Prepend the tool command to the arguments array
    const fullCommand = [finalTool, ...args];

    // Debug output removed - would interfere with CLI stdin/stdout

    // Run the tool with optional environment from context
    const env = setupContext?.env as Record<string, string> | undefined;
    const { stdout, stderr, timedOut } = await runCommand(fullCommand, env, projectRoot, timeout);

    if (timedOut) {
      result.timedOut = true;
      return result;
    }

    // Parse output into diagnostics (pass context for tool-specific parsing)
    result.diagnostics = langConfig.parseOutput(
      stdout,
      stderr,
      filePath,
      projectRoot,
      setupContext
    );

    return result;
  } catch (_error) {
    // Tool not available or command failed - return null (no checking performed)
    // This ensures consistent behavior across all languages
    return null;
  } finally {
    // Cleanup if needed
    if (cleanup) {
      cleanup();
    }
  }
}

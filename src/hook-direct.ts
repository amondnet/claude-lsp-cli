#!/usr/bin/env bun
/**
 * Direct Hook Handler - Simplified Claude Code hook using direct type checking
 * 
 * No LSP servers, just direct tool invocation for maximum reliability
 */

import { findProjectRoot, runDirectDiagnostics, extractFilePath } from "./cli-diagnostics-direct";
import { logger } from "./utils/logger";

/**
 * Handle PostToolUse hook event
 */
async function handlePostToolUse(): Promise<void> {
  try {
    const input = await Bun.stdin.text();
    
    if (!input || input.trim() === '') {
      return; // Empty input, nothing to check
    }
    
    let hookData: any;
    try {
      hookData = JSON.parse(input);
    } catch {
      return; // Invalid JSON, skip
    }
    
    // Extract file path from the hook data
    const filePath = extractFilePath(hookData);
    
    // Find project root
    let projectRoot: string | null = null;
    
    if (filePath) {
      projectRoot = await findProjectRoot(filePath);
    }
    
    if (!projectRoot) {
      // Try using working directory
      const workDir = hookData?.cwd || hookData?.workingDirectory || process.cwd();
      projectRoot = await findProjectRoot(workDir) || workDir;
    }
    
    // Skip if we're in a system directory or home directory
    if (projectRoot === "/" || projectRoot === process.env.HOME) {
      return;
    }
    
    // Run diagnostics
    const result = await runDirectDiagnostics(projectRoot);
    
    // Output if there are issues
    if (result.formatted && result.diagnostics.length > 0) {
      // Only show errors and warnings (not info/hints)
      const importantIssues = result.diagnostics.filter(
        d => d.severity === "error" || d.severity === "warning"
      );
      
      if (importantIssues.length > 0) {
        console.error(result.formatted);
        process.exit(2); // Signal to Claude that there are issues
      }
    }
    
  } catch (error) {
    logger.error("Hook processing failed", { error });
  }
}

// Main execution
if (import.meta.main) {
  const eventType = process.argv[2];
  
  if (eventType === "PostToolUse") {
    await handlePostToolUse();
  }
  
  process.exit(0);
}
#!/usr/bin/env bun

/**
 * LSP Diagnostics Hook for Claude Code
 * 
 * This hook runs LSP diagnostics on code changes and reports issues
 * to Claude Code for automatic error detection and fixing.
 */

// Import the CLI handler which contains all the logic
import { handleHookEvent } from "../src/cli-hooks";

async function main() {
  try {
    // Get the event type from command line args
    const eventType = process.argv[2] || "PostToolUse";
    
    // Run the diagnostics handler
    const hasErrors = await handleHookEvent(eventType);
    
    // Exit with appropriate code
    // 0 = no errors, 2 = errors found (shows feedback in Claude)
    process.exit(hasErrors ? 2 : 0);
    
  } catch (error) {
    console.error("Hook error:", error);
    process.exit(1);
  }
}

// Only run if this file is executed directly
if (import.meta.main) {
  await main();
}

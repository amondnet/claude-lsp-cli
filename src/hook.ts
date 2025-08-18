#!/usr/bin/env bun

/**
 * Claude LSP Hook - Dedicated hook handler for Claude Code
 * 
 * This is a streamlined hook handler that processes PostToolUse events
 * and triggers diagnostics checks. It's designed to be called directly
 * from Claude Code's settings.json without needing subcommands.
 * 
 * Usage in settings.json:
 *   "PostToolUse": ["claude-lsp-hook"]
 */

import { logger } from "./utils/logger";

async function handleHookEvent(eventType: string) {
  try {
    // Read hook data from stdin
    const stdinData = await Bun.stdin.text();
    
    // Try to find diagnostics.ts
    const possiblePaths = [
      // When running from source
      new URL("./diagnostics.ts", import.meta.url).pathname,
      // When running from compiled binary
      new URL("../src/diagnostics.ts", import.meta.url).pathname,
    ];
    
    let diagnosticsPath: string | null = null;
    for (const path of possiblePaths) {
      try {
        if (await Bun.file(path).exists()) {
          diagnosticsPath = path;
          break;
        }
      } catch (error) {
        await logger.debug('Path check failed', { path, error });
      }
    }
    
    if (!diagnosticsPath) {
      throw new Error("Could not find diagnostics.ts");
    }
    
    // Spawn diagnostics.ts with the event type
    const proc = Bun.spawn(["bun", diagnosticsPath, eventType], {
      stdin: "pipe",
      stdout: "inherit",
      stderr: "inherit",
    });
    
    // Pass the hook data to diagnostics
    if (proc.stdin) {
      proc.stdin.write(stdinData);
      proc.stdin.end();
    }
    
    // Wait for completion
    await proc.exited;
    
    // Exit with the same code
    process.exit(proc.exitCode || 0);
    
  } catch (error) {
    await logger.error('Hook processing failed', error, { eventType });
    
    // Output error as JSON for Claude to see
    console.error(JSON.stringify({
      error: "HOOK_PROCESSING_ERROR",
      eventType,
      message: error instanceof Error ? error.message : "Unknown error"
    }));
    
    process.exit(1);
  }
}

// Main execution
// The event type is passed as the first argument by Claude Code
const eventType = process.argv[2] || "PostToolUse";

// Only process PostToolUse events (the main use case)
// Other events are ignored to avoid unnecessary processing
if (eventType === "PostToolUse" || eventType === "SessionStart") {
  await handleHookEvent(eventType);
} else {
  // Silently exit for other event types
  process.exit(0);
}
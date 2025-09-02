#!/usr/bin/env bun
/**
 * File-Based Hook Handler - Simple per-file type checking
 * 
 * No project discovery, just check the specific file mentioned
 */

import { checkFile, formatDiagnostics } from "./file-checker";
import { logger } from "./utils/logger";

/**
 * Extract file path from hook data (handles actual Claude Code hook schema)
 */
function extractFilePath(hookData: any): string | null {
  // Official Claude Code hook schema paths
  const candidates = [
    // From tool_input (Write, Edit, etc.)
    hookData?.tool_input?.file_path,
    
    // From tool_response
    hookData?.tool_response?.filePath,
    hookData?.tool_response?.file_path,
    
    // Legacy/test format
    hookData?.input?.file_path,
    hookData?.output?.file_path,
    
    // For MultiEdit tools - check edits array
    hookData?.tool_input?.edits?.[0]?.file_path
  ];
  
  for (const candidate of candidates) {
    if (candidate && typeof candidate === "string" && candidate.length > 0) {
      return candidate;
    }
  }
  
  // Try to extract from tool response messages or output
  const outputText = hookData?.tool_response?.message || 
                    hookData?.tool_response?.output ||
                    hookData?.output;
                    
  if (outputText && typeof outputText === "string") {
    // Look for file paths in output (common patterns)
    const patterns = [
      /File "([^"]+)"/,
      /(?:wrote?|created?|modified?)\s+['"]?([^\s'"]+)/i,
      /at\s+([^\s:]+):\d+/,
      /^([^\s:]+):\d+:/m
    ];
    
    for (const pattern of patterns) {
      const match = outputText.match(pattern);
      if (match && match[1]) {
        // Make sure it looks like a source file
        const file = match[1];
        if (file.match(/\.(ts|tsx|js|jsx|py|go|rs|java|c|cpp|rb|php|swift|kt)$/i)) {
          return file;
        }
      }
    }
  }
  
  return null;
}

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
    
    if (!filePath) {
      return; // No file to check
    }
    
    // Make absolute if relative
    const absolutePath = filePath.startsWith("/") 
      ? filePath 
      : `${hookData?.cwd || process.cwd()}/${filePath}`;
    
    // Check the individual file
    const result = await checkFile(absolutePath);
    
    if (result && result.diagnostics.length > 0) {
      // Only show errors and warnings (not info/hints)
      const importantIssues = result.diagnostics.filter(
        d => d.severity === "error" || d.severity === "warning"
      );
      
      if (importantIssues.length > 0) {
        const formatted = formatDiagnostics({
          ...result,
          diagnostics: importantIssues
        });
        
        if (formatted) {
          console.error(formatted);
          process.exit(2); // Signal to Claude that there are issues
        }
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
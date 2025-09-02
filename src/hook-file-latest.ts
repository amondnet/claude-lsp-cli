#!/usr/bin/env bun
/**
 * File Hook with Latest-Only Results
 * 
 * Only shows results for the most recently edited file,
 * cancelling any pending checks for previous files
 */

import { checkFile, formatDiagnostics, type FileCheckResult } from "./file-checker-v2";
import { logger } from "./utils/logger";

// Track the latest file being checked
let latestFileRequested: string | null = null;
let latestRequestTime: number = 0;

/**
 * Check file and only display if it's still the latest
 */
async function checkLatestFile(filePath: string): Promise<void> {
  const requestTime = Date.now();
  latestFileRequested = filePath;
  latestRequestTime = requestTime;
  
  logger.debug(`Starting check for ${filePath} at ${requestTime}`);
  
  // Run the check
  const result = await checkFile(filePath);
  
  // Check if this is still the latest file requested
  if (latestFileRequested !== filePath || latestRequestTime !== requestTime) {
    logger.debug(`Discarding stale results for ${filePath} (newer file requested)`);
    return; // A newer file was requested, discard these results
  }
  
  // This is still the latest - display results
  if (result && result.diagnostics.length > 0) {
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
        process.exit(2); // Signal to Claude
      }
    }
  }
}

/**
 * Extract file path from hook data
 */
function extractFilePath(hookData: any): string | null {
  const candidates = [
    hookData?.tool_input?.file_path,
    hookData?.tool_response?.filePath,
    hookData?.tool_response?.file_path,
    hookData?.input?.file_path,
    hookData?.output?.file_path,
  ];
  
  for (const candidate of candidates) {
    if (candidate && typeof candidate === "string") {
      // Validate it's a source file
      if (candidate.match(/\.(ts|tsx|js|jsx|py|go|rs|java|c|cpp|rb|php|swift|kt)$/i)) {
        return candidate;
      }
    }
  }
  
  // Try to extract from output
  const outputText = hookData?.tool_response?.output || hookData?.output;
  if (outputText && typeof outputText === "string") {
    const patterns = [
      /(?:wrote?|created?|modified?)\s+['"]?([^\s'"]+\.(?:ts|py|js|go|rs|java))/i,
    ];
    
    for (const pattern of patterns) {
      const match = outputText.match(pattern);
      if (match && match[1]) {
        return match[1];
      }
    }
  }
  
  return null;
}

/**
 * Handle PostToolUse hook event
 */
export async function handlePostToolUse(): Promise<void> {
  try {
    const input = await Bun.stdin.text();
    
    if (!input || input.trim() === '') {
      return;
    }
    
    let hookData: any;
    try {
      hookData = JSON.parse(input);
    } catch {
      return;
    }
    
    const filePath = extractFilePath(hookData);
    if (!filePath) {
      return;
    }
    
    // Make absolute if relative
    const absolutePath = filePath.startsWith("/") 
      ? filePath 
      : `${hookData?.cwd || process.cwd()}/${filePath}`;
    
    // Check this file (results only shown if still latest)
    await checkLatestFile(absolutePath);
    
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
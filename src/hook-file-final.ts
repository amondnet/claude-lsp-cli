#!/usr/bin/env bun
/**
 * Final File Hook - One result per file with proper deduplication
 * 
 * Uses shared state file to ensure only the latest file's results are shown
 * even across multiple process invocations
 */

import { checkFile, formatDiagnostics } from "./file-checker-v2";
import { logger } from "./utils/logger";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

// Shared state file location
const STATE_DIR = process.env.XDG_RUNTIME_DIR || "/tmp";
const STATE_FILE = join(STATE_DIR, ".claude-lsp-latest-file.json");
const LOCK_FILE = join(STATE_DIR, ".claude-lsp-latest-file.lock");

interface SharedState {
  latestFile: string;
  requestTime: number;
  resultShown: boolean;
  resultTime?: number;
}

/**
 * Read shared state
 */
function readState(): SharedState | null {
  try {
    if (existsSync(STATE_FILE)) {
      const data = readFileSync(STATE_FILE, "utf-8");
      return JSON.parse(data);
    }
  } catch (error) {
    logger.debug("Failed to read state", { error });
  }
  return null;
}

/**
 * Write shared state with simple file locking
 */
function writeState(state: SharedState): void {
  try {
    // Simple lock mechanism
    let attempts = 0;
    while (existsSync(LOCK_FILE) && attempts < 50) {
      // Wait up to 500ms for lock
      Bun.sleepSync(10);
      attempts++;
    }
    
    // Acquire lock
    writeFileSync(LOCK_FILE, process.pid.toString());
    
    // Write state
    writeFileSync(STATE_FILE, JSON.stringify(state));
    
    // Release lock
    try {
      rmSync(LOCK_FILE);
    } catch {}
  } catch (error) {
    logger.debug("Failed to write state", { error });
  }
}

/**
 * Check if we should show results for this file
 */
function shouldShowResults(filePath: string, requestTime: number): boolean {
  const state = readState();
  
  if (!state) {
    // No state, this is the first/latest
    return true;
  }
  
  // Check if this is the latest file
  if (state.latestFile !== filePath) {
    // Different file was edited after this one
    return false;
  }
  
  // Check if this is the latest request for this file
  if (state.requestTime > requestTime) {
    // A newer request exists
    return false;
  }
  
  // Check if results were already shown recently (within 5 seconds)
  if (state.resultShown && state.resultTime) {
    const timeSinceShown = requestTime - state.resultTime;
    if (timeSinceShown < 5000) {
      // Already shown recently, suppress duplicate
      logger.debug(`Suppressing duplicate for ${filePath} (shown ${timeSinceShown}ms ago)`);
      return false;
    }
  }
  
  return true;
}

/**
 * Extract file path from hook data
 */
function extractFilePath(hookData: any): string | null {
  const candidates = [
    hookData?.tool_input?.file_path,
    hookData?.tool_response?.filePath,
    hookData?.input?.file_path,
    hookData?.output?.file_path,
  ];
  
  for (const candidate of candidates) {
    if (candidate && typeof candidate === "string") {
      if (candidate.match(/\.(ts|tsx|py|go|rs|java|c|cpp|php|swift|kt)$/i)) {
        return candidate;
      }
    }
  }
  
  // Extract from Bash output (Rule 5)
  if (hookData?.tool_name === "Bash" && hookData?.tool_response?.output) {
    const output = hookData.tool_response.output;
    // Look for file paths in output
    const fileRegex = /(?:^|\s|["'])(\/[^\s"']+\.(?:ts|tsx|py|go|rs|java|c|cpp|php|swift|kt))(?:$|\s|["'])/gmi;
    const match = fileRegex.exec(output);
    if (match) {
      return match[1];
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
    
    // Make absolute
    const absolutePath = filePath.startsWith("/") 
      ? filePath 
      : join(hookData?.cwd || process.cwd(), filePath);
    
    const requestTime = Date.now();
    
    // Check if this is a duplicate request
    const currentState = readState();
    if (currentState && 
        currentState.latestFile === absolutePath && 
        currentState.resultShown && 
        currentState.resultTime &&
        (requestTime - currentState.resultTime) < 5000) {
      logger.debug(`Suppressing duplicate check for ${absolutePath}`);
      return; // Don't even check, just exit
    }
    
    // Update state to mark this as latest
    writeState({
      latestFile: absolutePath,
      requestTime,
      resultShown: false
    });
    
    // Check the file
    const result = await checkFile(absolutePath);
    
    // Check if we should still show results
    if (!shouldShowResults(absolutePath, requestTime)) {
      logger.debug(`Suppressing results for ${absolutePath} (newer file edited)`);
      return;
    }
    
    // Show results if there are errors/warnings
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
          // Mark as shown
          writeState({
            latestFile: absolutePath,
            requestTime,
            resultShown: true,
            resultTime: Date.now()
          });
          
          console.error(formatted);
          process.exit(2);
        }
      }
    }
    
  } catch (error) {
    logger.error("Hook processing failed", { error });
  }
}

// Cleanup function
export function clearState(): void {
  try {
    if (existsSync(STATE_FILE)) {
      rmSync(STATE_FILE);
    }
    if (existsSync(LOCK_FILE)) {
      rmSync(LOCK_FILE);
    }
  } catch {}
}

// Main execution
if (import.meta.main) {
  const eventType = process.argv[2];
  
  if (eventType === "PostToolUse") {
    await handlePostToolUse();
  } else if (eventType === "clear") {
    clearState();
    console.log("State cleared");
  }
  
  process.exit(0);
}

// Import for fs functions
import { rmSync } from "fs";
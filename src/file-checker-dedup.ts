#!/usr/bin/env bun
/**
 * File Checker with Deduplication
 * 
 * Ensures only the latest error report per file is shown,
 * preventing duplicate reports across multiple tool calls
 */

import { checkFile as checkFileCore, formatDiagnostics, type FileCheckResult } from "./file-checker-v2";
import { createHash } from "crypto";

// Cache for recent file check results
interface CacheEntry {
  result: FileCheckResult;
  timestamp: number;
  contentHash: string;
  displayed: boolean;
}

class FileCheckCache {
  private cache = new Map<string, CacheEntry>();
  private readonly TTL = 30000; // 30 seconds TTL
  private readonly DEDUP_WINDOW = 5000; // 5 seconds deduplication window
  
  /**
   * Get cached result if still valid
   */
  get(filePath: string, contentHash: string): FileCheckResult | null {
    const entry = this.cache.get(filePath);
    
    if (!entry) return null;
    
    const now = Date.now();
    const age = now - entry.timestamp;
    
    // If content changed, invalidate cache
    if (entry.contentHash !== contentHash) {
      this.cache.delete(filePath);
      return null;
    }
    
    // If too old, remove from cache
    if (age > this.TTL) {
      this.cache.delete(filePath);
      return null;
    }
    
    // If recently displayed (within dedup window), don't show again
    if (entry.displayed && age < this.DEDUP_WINDOW) {
      return { ...entry.result, diagnostics: [] }; // Return empty result to suppress output
    }
    
    return entry.result;
  }
  
  /**
   * Store result in cache
   */
  set(filePath: string, result: FileCheckResult, contentHash: string, displayed: boolean = false): void {
    this.cache.set(filePath, {
      result,
      timestamp: Date.now(),
      contentHash,
      displayed
    });
    
    // Clean up old entries
    this.cleanup();
  }
  
  /**
   * Mark a file's results as displayed
   */
  markDisplayed(filePath: string): void {
    const entry = this.cache.get(filePath);
    if (entry) {
      entry.displayed = true;
      entry.timestamp = Date.now(); // Reset timestamp for dedup window
    }
  }
  
  /**
   * Clean up expired entries
   */
  private cleanup(): void {
    const now = Date.now();
    for (const [path, entry] of this.cache.entries()) {
      if (now - entry.timestamp > this.TTL) {
        this.cache.delete(path);
      }
    }
  }
  
  /**
   * Clear all cache entries
   */
  clear(): void {
    this.cache.clear();
  }
  
  /**
   * Get cache statistics
   */
  getStats(): { size: number; entries: string[] } {
    return {
      size: this.cache.size,
      entries: Array.from(this.cache.keys())
    };
  }
}

// Global cache instance (persists across hook invocations in same process)
const globalCache = new FileCheckCache();

/**
 * Calculate hash of file content for change detection
 */
async function getFileHash(filePath: string): Promise<string> {
  try {
    const file = Bun.file(filePath);
    const content = await file.text();
    return createHash("md5").update(content).digest("hex");
  } catch {
    return "unknown";
  }
}

/**
 * Check file with deduplication
 */
export async function checkFileWithDedup(
  filePath: string,
  options: {
    forceCheck?: boolean;
    suppressDuplicates?: boolean;
  } = {}
): Promise<FileCheckResult | null> {
  const contentHash = await getFileHash(filePath);
  
  // Check cache first (unless forced)
  if (!options.forceCheck) {
    const cached = globalCache.get(filePath, contentHash);
    if (cached) {
      // If it's an empty result (recently displayed), return null to suppress
      if (cached.diagnostics.length === 0 && !cached.timedOut) {
        return null;
      }
      return cached;
    }
  }
  
  // Perform actual check
  const result = await checkFileCore(filePath);
  
  if (result) {
    // Store in cache
    globalCache.set(filePath, result, contentHash, false);
    
    // If we should suppress duplicates and this has errors/warnings
    if (options.suppressDuplicates && result.diagnostics.length > 0) {
      // Mark as displayed so next check within window returns empty
      globalCache.markDisplayed(filePath);
    }
  }
  
  return result;
}

/**
 * Format and display results with deduplication
 */
export async function checkAndDisplay(
  filePath: string,
  options: {
    silent?: boolean;
  } = {}
): Promise<{ displayed: boolean; result: FileCheckResult | null }> {
  const result = await checkFileWithDedup(filePath, {
    suppressDuplicates: true
  });
  
  if (!result || result.diagnostics.length === 0) {
    return { displayed: false, result };
  }
  
  if (!options.silent) {
    const formatted = formatDiagnostics(result);
    if (formatted) {
      console.error(formatted);
    }
  }
  
  return { displayed: true, result };
}

/**
 * Hook handler with deduplication
 */
export async function handleHookWithDedup(hookData: any): Promise<void> {
  // Extract file path from hook data
  const filePath = extractFilePath(hookData);
  
  if (!filePath) return;
  
  // Make absolute if relative
  const absolutePath = filePath.startsWith("/") 
    ? filePath 
    : `${hookData?.cwd || process.cwd()}/${filePath}`;
  
  // Check and display with deduplication
  const { displayed } = await checkAndDisplay(absolutePath);
  
  if (displayed) {
    process.exit(2); // Signal to Claude that there are issues
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
      return candidate;
    }
  }
  
  return null;
}

// Export cache for testing
export { globalCache };

// CLI for testing
if (import.meta.main) {
  const command = process.argv[2];
  const file = process.argv[3];
  
  switch (command) {
    case "check":
      if (!file) {
        console.error("Usage: file-checker-dedup.ts check <file>");
        process.exit(1);
      }
      
      const { displayed, result } = await checkAndDisplay(file);
      if (!displayed) {
        console.log("No new issues to report (cached or no errors)");
      }
      console.log("\nCache stats:", globalCache.getStats());
      break;
      
    case "clear-cache":
      globalCache.clear();
      console.log("Cache cleared");
      break;
      
    case "cache-stats":
      console.log("Cache statistics:", globalCache.getStats());
      break;
      
    default:
      console.error("Commands: check <file>, clear-cache, cache-stats");
  }
}
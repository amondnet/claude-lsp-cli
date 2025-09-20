import { join, dirname } from 'path';
import { existsSync, readFileSync, writeFileSync, statSync, unlinkSync } from 'fs';
import { tmpdir } from 'os';
import { findProjectRoot } from '../../utils/common';

// Cache project roots to avoid repeated filesystem traversal
// Includes memory leak prevention with size limits and TTL
interface ProjectRootCacheEntry {
  root: string;
  lastUsed: number;
}

const projectRootCache = new Map<string, ProjectRootCacheEntry>();
const MAX_CACHE_SIZE = 1000; // Limit cache to 1000 entries
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes TTL

function cleanupCache(): void {
  if (projectRootCache.size <= MAX_CACHE_SIZE) return;

  const now = Date.now();
  const entriesToDelete: string[] = [];

  // Find expired entries
  for (const [key, value] of projectRootCache.entries()) {
    if (now - value.lastUsed > CACHE_TTL) {
      entriesToDelete.push(key);
    }
  }

  // If no expired entries, remove oldest entries
  if (entriesToDelete.length === 0) {
    const entries = Array.from(projectRootCache.entries());
    entries.sort((a, b) => a[1].lastUsed - b[1].lastUsed);
    const toRemove = Math.max(1, Math.floor(MAX_CACHE_SIZE * 0.1)); // Remove 10%
    for (let i = 0; i < toRemove && i < entries.length; i++) {
      const entry = entries[i];
      if (entry) {
        entriesToDelete.push(entry[0]);
      }
    }
  }

  // Delete entries
  for (const key of entriesToDelete) {
    projectRootCache.delete(key);
  }
}

export function getProjectRoot(filePath: string): string {
  const cached = projectRootCache.get(filePath);
  if (cached) {
    // Update last used time
    cached.lastUsed = Date.now();
    return cached.root;
  }

  // Cleanup cache if needed before adding new entry
  cleanupCache();

  // Use the common utility which has more comprehensive checks
  const root = findProjectRoot(filePath);

  // If findProjectRoot returned the file's directory (no project found),
  // use tmpdir as fallback for deduplication state
  const fileDir = dirname(filePath);
  const result = root === fileDir ? tmpdir() : root;

  // Cache with timestamp
  projectRootCache.set(filePath, {
    root: result,
    lastUsed: Date.now(),
  });

  return result;
}

export function getStateFile(projectRoot: string): string {
  const projectHash = projectRoot.replace(/[^a-zA-Z0-9]/g, '_');
  return join(tmpdir(), `claude-lsp-last-${projectHash}.json`);
}

interface CacheEntry {
  modTime: number;
  lastCheck: number;
}

interface CacheState {
  files: Record<string, CacheEntry>;
}

export function shouldShowResult(filePath: string): boolean {
  const projectRoot = getProjectRoot(filePath);
  const stateFile = getStateFile(projectRoot);

  try {
    // Get current file modification time
    const fileStats = statSync(filePath);
    const currentModTime = fileStats.mtimeMs;

    if (existsSync(stateFile)) {
      const state: CacheState = JSON.parse(readFileSync(stateFile, 'utf-8'));
      const cached = state.files?.[filePath];

      if (!cached) {
        return true; // File not in cache
      }

      // Skip if file hasn't been modified AND we checked recently
      if (cached.modTime === currentModTime && Date.now() - cached.lastCheck < 300000) {
        // 5 minute window
        return false;
      }
    }
  } catch {
    // Continue with empty state if file doesn't exist or is invalid
  }

  return true;
}

export function markResultShown(filePath: string): void {
  const projectRoot = getProjectRoot(filePath);
  const stateFile = getStateFile(projectRoot);
  const lockFile = stateFile + '.lock';

  // Simple retry mechanism for concurrent access
  const maxRetries = 10;
  const retryDelay = 10; // ms

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      // Try to create lock file atomically
      if (existsSync(lockFile)) {
        // Lock exists, wait and retry
        const now = Date.now();
        const lockAge = now - statSync(lockFile).mtimeMs;

        // If lock is stale (>1 second), remove it
        if (lockAge > 1000) {
          try {
            unlinkSync(lockFile);
          } catch {
            // Someone else removed it, that's fine
          }
        } else if (attempt < maxRetries - 1) {
          // Wait before retry
          Bun.sleepSync(retryDelay);
          continue;
        }
      }

      // Create lock file
      writeFileSync(lockFile, Date.now().toString());

      try {
        // Get file stats for caching
        const fileStats = statSync(filePath);

        // Read existing state or create new one
        let state: CacheState = { files: {} };
        if (existsSync(stateFile)) {
          try {
            state = JSON.parse(readFileSync(stateFile, 'utf-8'));
            if (!state.files) {
              state = { files: {} };
            }
          } catch {
            // Use empty state if parse fails
          }
        }

        // Store modification time and check time
        state.files[filePath] = {
          modTime: fileStats.mtimeMs,
          lastCheck: Date.now(),
        };

        writeFileSync(stateFile, JSON.stringify(state, null, 2));
      } finally {
        // Always remove lock file
        try {
          unlinkSync(lockFile);
        } catch {
          // Lock already removed, that's fine
        }
      }

      // Success, exit loop
      return;
    } catch {
      // Failed, will retry
      if (attempt === maxRetries - 1) {
        // Last attempt, give up gracefully
        return;
      }
    }
  }
}

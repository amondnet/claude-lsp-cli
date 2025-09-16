import { join, dirname } from 'path';
import { existsSync, readFileSync, writeFileSync, statSync, unlinkSync } from 'fs';
import { tmpdir } from 'os';

// Cache project roots to avoid repeated filesystem traversal
const projectRootCache = new Map<string, string>();

export function getProjectRoot(filePath: string): string {
  if (projectRootCache.has(filePath)) {
    const cached = projectRootCache.get(filePath);
    if (cached) return cached;
  }

  let dir = dirname(filePath);
  while (dir !== '/' && dir.length > 1) {
    if (
      existsSync(join(dir, 'package.json')) ||
      existsSync(join(dir, 'pyproject.toml')) ||
      existsSync(join(dir, 'go.mod')) ||
      existsSync(join(dir, 'Cargo.toml')) ||
      existsSync(join(dir, '.git'))
    ) {
      projectRootCache.set(filePath, dir);
      return dir;
    }
    dir = join(dir, '..');
  }

  const fallback = tmpdir();
  projectRootCache.set(filePath, fallback);
  return fallback;
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

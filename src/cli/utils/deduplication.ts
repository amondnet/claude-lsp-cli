import { join, dirname } from 'path';
import { existsSync, readFileSync, writeFileSync, statSync } from 'fs';
import { tmpdir } from 'os';
import { createHash } from 'crypto';

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
  file: string;
  diagnosticsCount: number;
  timestamp: number;
  fileModTime: number;
  fileHash: string;
}

export function shouldShowResult(filePath: string, diagnosticsCount: number): boolean {
  const projectRoot = getProjectRoot(filePath);
  const stateFile = getStateFile(projectRoot);

  try {
    if (existsSync(stateFile)) {
      const lastResult: CacheEntry = JSON.parse(readFileSync(stateFile, 'utf-8'));

      // Check if file has been modified since last check
      const fileStats = statSync(filePath);
      const currentModTime = fileStats.mtimeMs;

      // Generate simple hash for content validation
      const fileContent = readFileSync(filePath, 'utf-8');
      const currentHash = createHash('md5').update(fileContent).digest('hex');

      if (
        lastResult.file === filePath &&
        lastResult.diagnosticsCount === diagnosticsCount &&
        lastResult.fileModTime === currentModTime &&
        lastResult.fileHash === currentHash &&
        Date.now() - lastResult.timestamp < 5000 // Increased cache time to 5 seconds
      ) {
        return false;
      }
    }
  } catch {
    // Continue with empty state if file doesn't exist or is invalid
  }

  return true;
}

export function markResultShown(filePath: string, diagnosticsCount: number): void {
  const projectRoot = getProjectRoot(filePath);
  const stateFile = getStateFile(projectRoot);

  try {
    // Get file stats and hash for caching
    const fileStats = statSync(filePath);
    const fileContent = readFileSync(filePath, 'utf-8');
    const fileHash = createHash('md5').update(fileContent).digest('hex');

    const cacheEntry: CacheEntry = {
      file: filePath,
      diagnosticsCount,
      timestamp: Date.now(),
      fileModTime: fileStats.mtimeMs,
      fileHash,
    };

    writeFileSync(stateFile, JSON.stringify(cacheEntry));
  } catch {
    // Continue with empty state if file doesn't exist or is invalid
  }
}

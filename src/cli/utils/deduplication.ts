import { join, dirname } from 'path';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';

export function getProjectRoot(filePath: string): string {
  let dir = dirname(filePath);
  while (dir !== '/' && dir.length > 1) {
    if (
      existsSync(join(dir, 'package.json')) ||
      existsSync(join(dir, 'pyproject.toml')) ||
      existsSync(join(dir, 'go.mod')) ||
      existsSync(join(dir, 'Cargo.toml')) ||
      existsSync(join(dir, '.git'))
    ) {
      return dir;
    }
    dir = join(dir, '..');
  }
  return tmpdir();
}

export function getStateFile(projectRoot: string): string {
  const projectHash = projectRoot.replace(/[^a-zA-Z0-9]/g, '_');
  return join(tmpdir(), `claude-lsp-last-${projectHash}.json`);
}

export function shouldShowResult(filePath: string, diagnosticsCount: number): boolean {
  const projectRoot = getProjectRoot(filePath);
  const stateFile = getStateFile(projectRoot);

  try {
    if (existsSync(stateFile)) {
      const lastResult = JSON.parse(readFileSync(stateFile, 'utf-8'));
      if (
        lastResult.file === filePath &&
        lastResult.diagnosticsCount === diagnosticsCount &&
        Date.now() - lastResult.timestamp < 2000
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
    writeFileSync(
      stateFile,
      JSON.stringify({
        file: filePath,
        diagnosticsCount,
        timestamp: Date.now(),
      })
    );
  } catch {
    // Continue with empty state if file doesn't exist or is invalid
  }
}

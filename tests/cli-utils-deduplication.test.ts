import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { getProjectRoot, getStateFile, shouldShowResult, markResultShown } from '../src/cli/utils/deduplication';
import { mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';

describe('Deduplication Utilities', () => {
  const TEST_DIR = '/tmp/claude-lsp-dedup-test';
  const TEST_FILE = join(TEST_DIR, 'src', 'test.ts');

  beforeEach(() => {
    // Create test directory structure
    mkdirSync(join(TEST_DIR, 'src'), { recursive: true });
    writeFileSync(TEST_FILE, 'test content');
    // Clean up any existing state files
    const stateFile = getStateFile(TEST_DIR);
    if (existsSync(stateFile)) {
      rmSync(stateFile);
    }
  });

  afterEach(() => {
    // Clean up test directory
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
    // Clean up state files
    const stateFile = getStateFile(TEST_DIR);
    if (existsSync(stateFile)) {
      rmSync(stateFile);
    }
  });

  describe('getProjectRoot', () => {
    test('should find project root with package.json', () => {
      writeFileSync(join(TEST_DIR, 'package.json'), '{}');
      const root = getProjectRoot(TEST_FILE);
      expect(root).toBe(TEST_DIR);
    });

    test('should find project root with pyproject.toml', () => {
      writeFileSync(join(TEST_DIR, 'pyproject.toml'), '[tool.poetry]');
      const root = getProjectRoot(TEST_FILE);
      expect(root).toBe(TEST_DIR);
    });

    test('should find project root with go.mod', () => {
      writeFileSync(join(TEST_DIR, 'go.mod'), 'module test');
      const root = getProjectRoot(TEST_FILE);
      expect(root).toBe(TEST_DIR);
    });

    test('should find project root with Cargo.toml', () => {
      writeFileSync(join(TEST_DIR, 'Cargo.toml'), '[package]');
      const root = getProjectRoot(TEST_FILE);
      expect(root).toBe(TEST_DIR);
    });

    test('should find project root with .git directory', () => {
      mkdirSync(join(TEST_DIR, '.git'));
      const root = getProjectRoot(TEST_FILE);
      expect(root).toBe(TEST_DIR);
    });

    test('should return /tmp when no project markers found', () => {
      const orphanFile = '/tmp/orphan-file.ts';
      writeFileSync(orphanFile, 'test');
      const root = getProjectRoot(orphanFile);
      expect(root).toBe('/tmp');
      rmSync(orphanFile);
    });

    test('should find project root in parent directory', () => {
      const deepFile = join(TEST_DIR, 'src', 'components', 'deep', 'file.ts');
      mkdirSync(join(TEST_DIR, 'src', 'components', 'deep'), { recursive: true });
      writeFileSync(deepFile, 'test');
      writeFileSync(join(TEST_DIR, 'package.json'), '{}');
      
      const root = getProjectRoot(deepFile);
      expect(root).toBe(TEST_DIR);
    });

    test('should handle root directory path', () => {
      const root = getProjectRoot('/test.ts');
      expect(root).toBe('/tmp');
    });

    test('should prioritize package.json over other markers', () => {
      // Create multiple markers
      writeFileSync(join(TEST_DIR, 'package.json'), '{}');
      writeFileSync(join(TEST_DIR, 'go.mod'), 'module test');
      mkdirSync(join(TEST_DIR, '.git'));
      
      const root = getProjectRoot(TEST_FILE);
      expect(root).toBe(TEST_DIR);
    });
  });

  describe('getStateFile', () => {
    test('should generate consistent state file path', () => {
      const stateFile1 = getStateFile('/path/to/project');
      const stateFile2 = getStateFile('/path/to/project');
      expect(stateFile1).toBe(stateFile2);
      expect(stateFile1).toContain('claude-lsp-last-');
    });

    test('should sanitize project path in state file name', () => {
      const stateFile = getStateFile('/path/with/special-chars!@#');
      expect(stateFile).toMatch(/^\/tmp\/claude-lsp-last-[a-zA-Z0-9_]+\.json$/);
      expect(stateFile).not.toContain('!');
      expect(stateFile).not.toContain('@');
      expect(stateFile).not.toContain('#');
    });

    test('should generate different state files for different projects', () => {
      const stateFile1 = getStateFile('/project1');
      const stateFile2 = getStateFile('/project2');
      expect(stateFile1).not.toBe(stateFile2);
    });

    test('should handle empty project root', () => {
      const stateFile = getStateFile('');
      expect(stateFile).toMatch(/^\/tmp\/claude-lsp-last-\.json$/);
    });
  });

  describe('shouldShowResult', () => {
    test('should show result when no state file exists', () => {
      const shouldShow = shouldShowResult(TEST_FILE, 5);
      expect(shouldShow).toBe(true);
    });

    test('should show result when file path differs', () => {
      // Mark a different file as shown
      markResultShown('/different/file.ts', 5);
      
      const shouldShow = shouldShowResult(TEST_FILE, 5);
      expect(shouldShow).toBe(true);
    });

    test('should show result when diagnostics count differs', () => {
      // Mark with different count
      markResultShown(TEST_FILE, 3);
      
      const shouldShow = shouldShowResult(TEST_FILE, 5);
      expect(shouldShow).toBe(true);
    });

    test('should not show result when same file and count within time window', () => {
      markResultShown(TEST_FILE, 5);
      
      const shouldShow = shouldShowResult(TEST_FILE, 5);
      expect(shouldShow).toBe(false);
    });

    test('should show result when time window expires', async () => {
      markResultShown(TEST_FILE, 5);
      
      // Wait for time window to expire (2 seconds)
      await new Promise(resolve => setTimeout(resolve, 2100));
      
      const shouldShow = shouldShowResult(TEST_FILE, 5);
      expect(shouldShow).toBe(true);
    });

    test('should handle zero diagnostics count', () => {
      markResultShown(TEST_FILE, 0);
      
      const shouldShow = shouldShowResult(TEST_FILE, 0);
      expect(shouldShow).toBe(false);
    });

    test('should handle corrupted state file gracefully', () => {
      const projectRoot = getProjectRoot(TEST_FILE);
      const stateFile = getStateFile(projectRoot);
      
      // Write invalid JSON
      writeFileSync(stateFile, 'invalid json{');
      
      const shouldShow = shouldShowResult(TEST_FILE, 5);
      expect(shouldShow).toBe(true);
    });

    test('should handle state file with missing fields', () => {
      const projectRoot = getProjectRoot(TEST_FILE);
      const stateFile = getStateFile(projectRoot);
      
      // Write JSON with missing fields
      writeFileSync(stateFile, JSON.stringify({ file: TEST_FILE }));
      
      const shouldShow = shouldShowResult(TEST_FILE, 5);
      expect(shouldShow).toBe(true);
    });
  });

  describe('markResultShown', () => {
    test('should create state file with correct structure', () => {
      markResultShown(TEST_FILE, 10);
      
      const projectRoot = getProjectRoot(TEST_FILE);
      const stateFile = getStateFile(projectRoot);
      
      expect(existsSync(stateFile)).toBe(true);
      
      const state = JSON.parse(readFileSync(stateFile, 'utf-8'));
      expect(state.file).toBe(TEST_FILE);
      expect(state.diagnosticsCount).toBe(10);
      expect(state.timestamp).toBeCloseTo(Date.now(), -2); // Within 100ms
    });

    test('should overwrite existing state file', () => {
      markResultShown(TEST_FILE, 5);
      markResultShown(TEST_FILE, 10);
      
      const projectRoot = getProjectRoot(TEST_FILE);
      const stateFile = getStateFile(projectRoot);
      
      const state = JSON.parse(readFileSync(stateFile, 'utf-8'));
      expect(state.diagnosticsCount).toBe(10);
    });

    test('should handle write errors gracefully', () => {
      // Make state file directory read-only
      const projectRoot = getProjectRoot(TEST_FILE);
      const stateFile = getStateFile(projectRoot);
      
      // Try to create a directory where the state file should be
      // This will fail if file already exists, which is what we want to test
      try {
        mkdirSync(stateFile, { recursive: true });
      } catch {
        // If it fails, that's fine - we're testing error handling
      }
      
      // Should not throw even if write fails
      expect(() => markResultShown(TEST_FILE, 5)).not.toThrow();
      
      // Clean up if directory was created
      try {
        rmSync(stateFile, { recursive: true });
      } catch {
        // Ignore cleanup errors
      }
    });

    test('should handle concurrent writes', () => {
      // Simulate concurrent writes
      const promises = [];
      for (let i = 0; i < 10; i++) {
        promises.push(new Promise<void>(resolve => {
          markResultShown(TEST_FILE, i);
          resolve();
        }));
      }
      
      Promise.all(promises);
      
      const projectRoot = getProjectRoot(TEST_FILE);
      const stateFile = getStateFile(projectRoot);
      
      // Should have some value written
      expect(existsSync(stateFile)).toBe(true);
      const state = JSON.parse(readFileSync(stateFile, 'utf-8'));
      expect(state.file).toBe(TEST_FILE);
      expect(typeof state.diagnosticsCount).toBe('number');
    });
  });

  describe('Integration scenarios', () => {
    test('should deduplicate repeated checks correctly', () => {
      // First check - should show
      expect(shouldShowResult(TEST_FILE, 5)).toBe(true);
      markResultShown(TEST_FILE, 5);
      
      // Second check immediately - should not show
      expect(shouldShowResult(TEST_FILE, 5)).toBe(false);
      
      // Different count - should show
      expect(shouldShowResult(TEST_FILE, 3)).toBe(true);
      markResultShown(TEST_FILE, 3);
      
      // Same new count - should not show
      expect(shouldShowResult(TEST_FILE, 3)).toBe(false);
    });

    test('should handle multiple files in same project', () => {
      const file1 = join(TEST_DIR, 'file1.ts');
      const file2 = join(TEST_DIR, 'file2.ts');
      writeFileSync(file1, 'test');
      writeFileSync(file2, 'test');
      writeFileSync(join(TEST_DIR, 'package.json'), '{}');
      
      // Both files should use same project root
      expect(getProjectRoot(file1)).toBe(getProjectRoot(file2));
      
      // But maintain separate deduplication
      markResultShown(file1, 5);
      expect(shouldShowResult(file1, 5)).toBe(false);
      expect(shouldShowResult(file2, 5)).toBe(true);
    });

    test('should handle project without any markers', () => {
      const orphanDir = '/tmp/orphan-project';
      const orphanFile = join(orphanDir, 'file.ts');
      mkdirSync(orphanDir, { recursive: true });
      writeFileSync(orphanFile, 'test');
      
      const root = getProjectRoot(orphanFile);
      expect(root).toBe('/tmp');
      
      // Should still work for deduplication
      expect(shouldShowResult(orphanFile, 5)).toBe(true);
      markResultShown(orphanFile, 5);
      expect(shouldShowResult(orphanFile, 5)).toBe(false);
      
      // Clean up
      rmSync(orphanDir, { recursive: true });
    });
  });
});
import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import {
  getProjectRoot,
  getStateFile,
  shouldShowResult,
  markResultShown,
} from '../src/cli/utils/deduplication';
import { mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

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

    test('should return tmpdir when no project markers found', () => {
      const orphanFile = join(tmpdir(), 'orphan-file.ts');
      writeFileSync(orphanFile, 'test');
      const root = getProjectRoot(orphanFile);
      expect(root).toBe(tmpdir());
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
      expect(root).toBe(tmpdir());
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
      const tempDir = tmpdir().replace(/[\\]/g, '\\\\'); // Escape backslashes for regex
      const pattern = new RegExp(`^${tempDir}/claude-lsp-last-[a-zA-Z0-9_]+.json$`);
      expect(stateFile).toMatch(pattern);
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
      expect(stateFile).toBe(join(tmpdir(), 'claude-lsp-last-.json'));
    });
  });

  describe('shouldShowResult', () => {
    test('should show result when no state file exists', () => {
      const shouldShow = shouldShowResult(TEST_FILE);
      expect(shouldShow).toBe(true);
    });

    test('should show result when file path differs', () => {
      // Mark a different file as shown
      markResultShown('/different/file.ts');

      const shouldShow = shouldShowResult(TEST_FILE);
      expect(shouldShow).toBe(true);
    });

    test('should show result when file has been modified', () => {
      // Mark file as checked
      markResultShown(TEST_FILE);

      // Modify the file by changing its modification time
      const fs = require('fs');
      const newTime = new Date(Date.now() + 1000); // 1 second in future
      fs.utimesSync(TEST_FILE, newTime, newTime);

      const shouldShow = shouldShowResult(TEST_FILE);
      expect(shouldShow).toBe(true);
    });

    test('should not show result when same file not modified within time window', () => {
      markResultShown(TEST_FILE);

      const shouldShow = shouldShowResult(TEST_FILE);
      expect(shouldShow).toBe(false);
    });

    test('should show result when time window expires', async () => {
      markResultShown(TEST_FILE);

      // Mock time passing by modifying the cache directly
      const projectRoot = getProjectRoot(TEST_FILE);
      const stateFile = getStateFile(projectRoot);
      const state = JSON.parse(readFileSync(stateFile, 'utf-8'));
      // Set lastCheck to over 5 minutes ago
      state.files[TEST_FILE].lastCheck = Date.now() - 301000;
      writeFileSync(stateFile, JSON.stringify(state));

      const shouldShow = shouldShowResult(TEST_FILE);
      expect(shouldShow).toBe(true);
    });

    test('should handle unmodified file', () => {
      markResultShown(TEST_FILE);

      const shouldShow = shouldShowResult(TEST_FILE);
      expect(shouldShow).toBe(false);
    });

    test('should handle corrupted state file gracefully', () => {
      const projectRoot = getProjectRoot(TEST_FILE);
      const stateFile = getStateFile(projectRoot);

      // Write invalid JSON
      writeFileSync(stateFile, 'invalid json{');

      const shouldShow = shouldShowResult(TEST_FILE);
      expect(shouldShow).toBe(true);
    });

    test('should handle state file with missing fields', () => {
      const projectRoot = getProjectRoot(TEST_FILE);
      const stateFile = getStateFile(projectRoot);

      // Write JSON with missing fields
      writeFileSync(stateFile, JSON.stringify({ _file: TEST_FILE }));

      const shouldShow = shouldShowResult(TEST_FILE);
      expect(shouldShow).toBe(true);
    });
  });

  describe('markResultShown', () => {
    test('should create state file with correct structure', () => {
      markResultShown(TEST_FILE);

      const projectRoot = getProjectRoot(TEST_FILE);
      const stateFile = getStateFile(projectRoot);

      expect(existsSync(stateFile)).toBe(true);

      const state = JSON.parse(readFileSync(stateFile, 'utf-8'));
      expect(state.files).toBeDefined();
      expect(state.files[TEST_FILE]).toBeDefined();
      expect(state.files[TEST_FILE].modTime).toBeDefined();
      expect(state.files[TEST_FILE].lastCheck).toBeCloseTo(Date.now(), -2); // Within 100ms
    });

    test('should overwrite existing state file', () => {
      markResultShown(TEST_FILE);
      markResultShown(TEST_FILE);

      const projectRoot = getProjectRoot(TEST_FILE);
      const stateFile = getStateFile(projectRoot);

      const state = JSON.parse(readFileSync(stateFile, 'utf-8'));
      expect(state.files[TEST_FILE]).toBeDefined();
      expect(state.files[TEST_FILE].modTime).toBeDefined();
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
      expect(() => markResultShown(TEST_FILE)).not.toThrow();

      // Clean up if directory was created
      try {
        rmSync(stateFile, { recursive: true });
      } catch {
        // Ignore cleanup errors
      }
    });

    test('should handle concurrent writes', async () => {
      // Simulate concurrent writes
      const promises = [];
      for (let i = 0; i < 10; i++) {
        promises.push(
          new Promise<void>((resolve) => {
            markResultShown(TEST_FILE);
            resolve();
          })
        );
      }

      await Promise.all(promises);

      const projectRoot = getProjectRoot(TEST_FILE);
      const stateFile = getStateFile(projectRoot);

      // Should have some value written
      expect(existsSync(stateFile)).toBe(true);
      const state = JSON.parse(readFileSync(stateFile, 'utf-8'));
      expect(state.files[TEST_FILE]).toBeDefined();
      expect(typeof state.files[TEST_FILE].modTime).toBe('number');
    });
  });

  describe('Integration scenarios', () => {
    test('should deduplicate repeated checks correctly', () => {
      // First check - should show
      expect(shouldShowResult(TEST_FILE)).toBe(true);
      markResultShown(TEST_FILE);

      // Second check immediately - should not show
      expect(shouldShowResult(TEST_FILE)).toBe(false);

      // Modify file by changing its modification time - should show
      const fs = require('fs');
      const newTime = new Date(Date.now() + 1000); // 1 second in future
      fs.utimesSync(TEST_FILE, newTime, newTime);
      expect(shouldShowResult(TEST_FILE)).toBe(true);
      markResultShown(TEST_FILE);

      // Same file not modified - should not show
      expect(shouldShowResult(TEST_FILE)).toBe(false);
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
      markResultShown(file1);
      expect(shouldShowResult(file1)).toBe(false);
      expect(shouldShowResult(file2)).toBe(true);
    });

    test('should handle project without any markers', () => {
      const orphanDir = join(tmpdir(), 'orphan-project');
      const orphanFile = join(orphanDir, 'file.ts');
      mkdirSync(orphanDir, { recursive: true });
      writeFileSync(orphanFile, 'test');

      const root = getProjectRoot(orphanFile);
      expect(root).toBe(tmpdir());

      // Should still work for deduplication
      expect(shouldShowResult(orphanFile)).toBe(true);
      markResultShown(orphanFile);
      expect(shouldShowResult(orphanFile)).toBe(false);

      // Clean up
      rmSync(orphanDir, { recursive: true });
    });
  });
});

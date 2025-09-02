import { describe, test, expect, beforeEach, afterAll } from "bun:test";
import { checkFileWithDedup, checkAndDisplay, globalCache } from "../src/file-checker-dedup";
import { writeFileSync, mkdirSync, rmSync } from "fs";
import { join } from "path";

const TEST_DIR = "/tmp/claude-lsp-dedup-test";

describe("File Checker Deduplication", () => {
  beforeEach(() => {
    // Clear cache before each test
    globalCache.clear();
    
    // Create test directory
    mkdirSync(TEST_DIR, { recursive: true });
  });
  
  test("should return cached result for same file within TTL", async () => {
    const testFile = join(TEST_DIR, "test.ts");
    writeFileSync(testFile, `const x: string = 42; // Type error`);
    
    // First check
    const result1 = await checkFileWithDedup(testFile);
    expect(result1).toBeTruthy();
    expect(result1!.diagnostics.length).toBeGreaterThan(0);
    
    // Second check (should be cached)
    const result2 = await checkFileWithDedup(testFile);
    expect(result2).toBeTruthy();
    expect(result2!.diagnostics).toEqual(result1!.diagnostics);
    
    // Verify cache has the entry
    const stats = globalCache.getStats();
    expect(stats.size).toBe(1);
    expect(stats.entries).toContain(testFile);
  });
  
  test("should invalidate cache when file content changes", async () => {
    const testFile = join(TEST_DIR, "test.ts");
    
    // Initial content with error
    writeFileSync(testFile, `const x: string = 42;`);
    const result1 = await checkFileWithDedup(testFile);
    expect(result1!.diagnostics.length).toBeGreaterThan(0);
    
    // Change content (fix error)
    writeFileSync(testFile, `const x: string = "hello";`);
    const result2 = await checkFileWithDedup(testFile);
    
    // Should get new result, not cached
    expect(result2!.diagnostics.length).toBe(0);
  });
  
  test("should suppress duplicate displays within dedup window", async () => {
    const testFile = join(TEST_DIR, "test.ts");
    writeFileSync(testFile, `const x: string = 42;`);
    
    // First display
    const { displayed: displayed1 } = await checkAndDisplay(testFile, { silent: true });
    expect(displayed1).toBe(true);
    
    // Second display immediately after (should be suppressed)
    const { displayed: displayed2 } = await checkAndDisplay(testFile, { silent: true });
    expect(displayed2).toBe(false);
  });
  
  test("should show errors again after dedup window expires", async () => {
    const testFile = join(TEST_DIR, "test.ts");
    writeFileSync(testFile, `const x: string = 42;`);
    
    // First display
    const { displayed: displayed1 } = await checkAndDisplay(testFile, { silent: true });
    expect(displayed1).toBe(true);
    
    // Wait for dedup window to expire (5 seconds in implementation)
    // For testing, we'll just clear the cache to simulate expiry
    globalCache.clear();
    
    // Should display again
    const { displayed: displayed2 } = await checkAndDisplay(testFile, { silent: true });
    expect(displayed2).toBe(true);
  });
  
  test("should handle multiple files independently", async () => {
    const file1 = join(TEST_DIR, "file1.ts");
    const file2 = join(TEST_DIR, "file2.ts");
    
    writeFileSync(file1, `const x: string = 42;`);
    writeFileSync(file2, `const y: number = "hello";`);
    
    // Check both files
    const result1 = await checkFileWithDedup(file1);
    const result2 = await checkFileWithDedup(file2);
    
    expect(result1!.diagnostics.length).toBeGreaterThan(0);
    expect(result2!.diagnostics.length).toBeGreaterThan(0);
    
    // Cache should have both
    const stats = globalCache.getStats();
    expect(stats.size).toBe(2);
    expect(stats.entries).toContain(file1);
    expect(stats.entries).toContain(file2);
  });
  
  test("should only show latest error report per file", async () => {
    const testFile = join(TEST_DIR, "evolving.ts");
    
    // Version 1: One error
    writeFileSync(testFile, `const x: string = 42;`);
    const result1 = await checkFileWithDedup(testFile);
    expect(result1!.diagnostics.length).toBe(1);
    
    // Version 2: Two errors
    writeFileSync(testFile, `
      const x: string = 42;
      const y: number = "hello";
    `);
    const result2 = await checkFileWithDedup(testFile);
    expect(result2!.diagnostics.length).toBe(2);
    
    // Version 3: No errors
    writeFileSync(testFile, `
      const x: string = "hello";
      const y: number = 42;
    `);
    const result3 = await checkFileWithDedup(testFile);
    expect(result3!.diagnostics.length).toBe(0);
    
    // Cache should only have the latest
    const stats = globalCache.getStats();
    expect(stats.size).toBe(1);
  });
  
  test("should handle force check option", async () => {
    const testFile = join(TEST_DIR, "test.ts");
    writeFileSync(testFile, `const x: string = 42;`);
    
    // First check
    const result1 = await checkFileWithDedup(testFile);
    const checkTime1 = Date.now();
    
    // Force check (should bypass cache)
    const result2 = await checkFileWithDedup(testFile, { forceCheck: true });
    const checkTime2 = Date.now();
    
    // Both should have same errors but force check took time
    expect(result2!.diagnostics).toEqual(result1!.diagnostics);
    expect(checkTime2 - checkTime1).toBeGreaterThan(0);
  });
});

// Cleanup after all tests
afterAll(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
  globalCache.clear();
});
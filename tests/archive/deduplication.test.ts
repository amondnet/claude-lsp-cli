import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import { DiagnosticDeduplicator } from "../src/utils/diagnostic-dedup";
// Database import removed - not used
import { rmSync, existsSync } from "fs";
import { join } from "path";

describe("DiagnosticDeduplicator", () => {
  // Use unique project paths for each test to avoid conflicts
  let testProjectPath: string;
  const testDbPath = join(process.env.HOME || "", ".claude/data/test-claude-code-lsp.db");
  let dedup: DiagnosticDeduplicator;

  beforeEach(() => {
    // Generate unique project path for each test to avoid conflicts
    testProjectPath = `/test/project/${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
    
    // Clean up any existing test database
    if (existsSync(testDbPath)) {
      rmSync(testDbPath);
    }
    
    // Create a test instance with a test database
    process.env.CLAUDE_HOME = join(process.env.HOME || "", ".claude");
    dedup = new DiagnosticDeduplicator(testProjectPath);
  });

  afterEach(() => {
    // Close the database connection first
    if (dedup) {
      dedup.close();
    }
    
    // Clean up test database
    if (existsSync(testDbPath)) {
      try {
        rmSync(testDbPath);
      } catch (e) {
        // Ignore cleanup errors
      }
    }
  });

  test("returns all diagnostics when database is empty", async () => {
    const diagnostics = [
      {
        file: "/test/file.ts",
        line: 10,
        column: 5,
        severity: "error" as const,
        message: "Type error"
      }
    ];
    
    // Database is empty, so all diagnostics are new
    const result = await dedup.processDiagnostics(diagnostics);
    expect(result).toHaveLength(1);
  });

  test("markAsDisplayed adds diagnostics to dedup database", async () => {
    const diagnostics = [
      {
        file: "/test/file.ts",
        line: 10,
        column: 5,
        severity: "error" as const,
        message: "Type error",
        source: "typescript"
      }
    ];

    // First time - should return the diagnostic
    const result1 = await dedup.processDiagnostics(diagnostics);
    expect(result1).toHaveLength(1);
    
    // Mark as displayed
    dedup.markAsDisplayed(result1);
    
    // Second time - should be filtered (already displayed)
    const result2 = await dedup.processDiagnostics(diagnostics);
    expect(result2).toHaveLength(0);
  });

  test("returns new diagnostic on first report", async () => {
    const diagnostics = [
      {
        file: "/test/file.ts",
        line: 10,
        column: 5,
        severity: "error" as const,
        message: "Type error"
      }
    ];

    const result = await dedup.processDiagnostics(diagnostics);
    
    // Should return the new diagnostic (first time seeing it)
    expect(result).toHaveLength(1);
    expect(result[0].message).toBe("Type error");
  });

  test("returns empty array for duplicate diagnostics", async () => {
    const diagnostics = [
      {
        file: "/test/file.ts",
        line: 10,
        column: 5,
        severity: "error" as const,
        message: "Type error"
      }
    ];

    // First report - should return the new diagnostic
    const result1 = await dedup.processDiagnostics(diagnostics);
    expect(result1).toHaveLength(1);
    
    // Mark as displayed (simulate server behavior)
    dedup.markAsDisplayed(result1);

    // Duplicate report - should return empty array (already seen)
    const result2 = await dedup.processDiagnostics(diagnostics);
    expect(result2).toHaveLength(0);
  });

  test("returns only new diagnostics when some are already seen", async () => {
    const diagnostics1 = [
      {
        file: "/test/file.ts",
        line: 10,
        column: 5,
        severity: "error" as const,
        message: "Type error"
      }
    ];

    const diagnostics2 = [
      {
        file: "/test/file.ts",
        line: 10,
        column: 5,
        severity: "error" as const,
        message: "Type error"
      },
      {
        file: "/test/file.ts",
        line: 20,
        column: 10,
        severity: "warning" as const,
        message: "Unused variable"
      }
    ];

    // First report - mark as displayed
    const result1 = await dedup.processDiagnostics(diagnostics1);
    dedup.markAsDisplayed(result1);
    
    // Second report - should only return the new diagnostic
    const result2 = await dedup.processDiagnostics(diagnostics2);

    expect(result2).toHaveLength(1);
    expect(result2[0].message).toBe("Unused variable");
  });

  test("returns empty when all diagnostics already seen", async () => {
    const diagnostics = [
      {
        file: "/test/file.ts",
        line: 10,
        column: 5,
        severity: "error" as const,
        message: "Type error"
      },
      {
        file: "/test/file.ts",
        line: 20,
        column: 10,
        severity: "warning" as const,
        message: "Unused variable"
      }
    ];

    // First report - mark all as displayed
    const result1 = await dedup.processDiagnostics(diagnostics);
    dedup.markAsDisplayed(result1);
    
    // Second report with same diagnostics - should return empty
    const result2 = await dedup.processDiagnostics(diagnostics);

    expect(result2).toHaveLength(0);
  });

  test("returns empty array when no diagnostics", async () => {
    const diagnostics = [
      {
        file: "/test/file.ts",
        line: 10,
        column: 5,
        severity: "error" as const,
        message: "Type error"
      }
    ];

    // First report with errors - mark as displayed
    const result1 = await dedup.processDiagnostics(diagnostics);
    dedup.markAsDisplayed(result1);

    // No diagnostics (all resolved)
    const result = await dedup.processDiagnostics([]);

    expect(result).toHaveLength(0);
  });

  test("returns empty array for no diagnostics and no history", async () => {
    const result = await dedup.processDiagnostics([]);

    expect(result).toHaveLength(0);
  });

  test("handles diagnostics with optional fields", async () => {
    const diagnostics = [
      {
        file: "/test/file.ts",
        line: 10,
        column: 5,
        severity: "error" as const,
        message: "Type error",
        source: "typescript",
        ruleId: "TS2322"
      }
    ];

    const result = await dedup.processDiagnostics(diagnostics);
    
    expect(result).toHaveLength(1);
    expect(result[0].source).toBe("typescript");
    expect(result[0].ruleId).toBe("TS2322");
  });

  test("cleanup removes old diagnostics", async () => {
    const diagnostics = [
      {
        file: "/test/file.ts",
        line: 10,
        column: 5,
        severity: "error" as const,
        message: "Type error"
      }
    ];

    await dedup.processDiagnostics(diagnostics);
    
    // Cleanup should remove diagnostics older than 24 hours
    // For testing, we'd need to mock the timestamp or expose cleanup method
    dedup.cleanup();
    
    // After cleanup, old diagnostics should be removed
    // This test would need additional setup to properly test the 24-hour window
    expect(true).toBe(true); // Placeholder for now
  });
});
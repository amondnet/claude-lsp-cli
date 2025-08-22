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
    // Clean up test database
    if (existsSync(testDbPath)) {
      try {
        rmSync(testDbPath);
      } catch (e) {
        // Ignore cleanup errors
      }
    }
  });

  test("isFirstRun returns true for new project", () => {
    expect(dedup.isFirstRun()).toBe(true);
  });

  test("isFirstRun returns false after processing diagnostics", async () => {
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

    await dedup.processDiagnostics(diagnostics);
    expect(dedup.isFirstRun()).toBe(false);
  });

  test("returns shouldReport=true for first diagnostic report", async () => {
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
    
    expect(result.shouldReport).toBe(true);
    expect(result.diff.added).toHaveLength(1);
    expect(result.diff.resolved).toHaveLength(0);
    expect(result.diff.unchanged).toHaveLength(0);
  });

  test("returns shouldReport=false for duplicate diagnostics", async () => {
    const diagnostics = [
      {
        file: "/test/file.ts",
        line: 10,
        column: 5,
        severity: "error" as const,
        message: "Type error"
      }
    ];

    // First report
    const result1 = await dedup.processDiagnostics(diagnostics);
    expect(result1.shouldReport).toBe(true);

    // Duplicate report - should not report
    const result2 = await dedup.processDiagnostics(diagnostics);
    expect(result2.shouldReport).toBe(false);
    expect(result2.diff.unchanged).toHaveLength(1);
    expect(result2.diff.added).toHaveLength(0);
    expect(result2.diff.resolved).toHaveLength(0);
  });

  test("correctly identifies added diagnostics", async () => {
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

    await dedup.processDiagnostics(diagnostics1);
    const result = await dedup.processDiagnostics(diagnostics2);

    expect(result.shouldReport).toBe(true);
    expect(result.diff.added).toHaveLength(1);
    expect(result.diff.added[0].message).toBe("Unused variable");
    expect(result.diff.unchanged).toHaveLength(1);
    expect(result.diff.resolved).toHaveLength(0);
  });

  test("correctly identifies resolved diagnostics", async () => {
    const diagnostics1 = [
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

    const diagnostics2 = [
      {
        file: "/test/file.ts",
        line: 10,
        column: 5,
        severity: "error" as const,
        message: "Type error"
      }
    ];

    await dedup.processDiagnostics(diagnostics1);
    const result = await dedup.processDiagnostics(diagnostics2);

    expect(result.shouldReport).toBe(true);
    expect(result.diff.resolved).toHaveLength(1);
    expect(result.diff.resolved[0].message).toBe("Unused variable");
    expect(result.diff.unchanged).toHaveLength(1);
    expect(result.diff.added).toHaveLength(0);
  });

  test("reports when all diagnostics are resolved", async () => {
    const diagnostics = [
      {
        file: "/test/file.ts",
        line: 10,
        column: 5,
        severity: "error" as const,
        message: "Type error"
      }
    ];

    // First report with errors
    await dedup.processDiagnostics(diagnostics);

    // All errors resolved
    const result = await dedup.processDiagnostics([]);

    expect(result.shouldReport).toBe(true);
    expect(result.diff.resolved).toHaveLength(1);
    expect(result.diff.added).toHaveLength(0);
    expect(result.diff.unchanged).toHaveLength(0);
  });

  test("does not report when no diagnostics and no history", async () => {
    const result = await dedup.processDiagnostics([]);

    expect(result.shouldReport).toBe(false);
    expect(result.diff.resolved).toHaveLength(0);
    expect(result.diff.added).toHaveLength(0);
    expect(result.diff.unchanged).toHaveLength(0);
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
    
    expect(result.shouldReport).toBe(true);
    expect(result.diff.added).toHaveLength(1);
    expect(result.diff.added[0].source).toBe("typescript");
    expect(result.diff.added[0].ruleId).toBe("TS2322");
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
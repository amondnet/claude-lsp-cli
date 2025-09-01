/**
 * High-impact test for diagnostic-dedup.ts
 * Tests critical deduplication to prevent duplicate error reports
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { DiagnosticDeduplicator } from "../src/utils/diagnostic-dedup";
import { rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

describe("Diagnostic Deduplication - Critical", () => {
  let dedup: DiagnosticDeduplicator;
  let testProject: string;

  beforeAll(() => {
    testProject = join(tmpdir(), `dedup-test-${Date.now()}`);
    dedup = new DiagnosticDeduplicator(testProject);
  });

  afterAll(() => {
    dedup.close();
    // Clean up database
    rmSync(testProject, { recursive: true, force: true });
  });

  describe("Critical: Prevent Duplicate Diagnostics", () => {
    test("should deduplicate identical diagnostics", async () => {
      const diagnostics = [
        {
          file: "test.ts",
          line: 10,
          column: 5,
          severity: "error" as const,
          message: "Type 'string' is not assignable to type 'number'",
          source: "typescript"
        },
        {
          file: "test.ts",
          line: 10,
          column: 5,
          severity: "error" as const,
          message: "Type 'string' is not assignable to type 'number'",
          source: "typescript"
        },
        {
          file: "test.ts",
          line: 10,
          column: 5,
          severity: "error" as const,
          message: "Type 'string' is not assignable to type 'number'",
          source: "typescript"
        }
      ];

      // First call - all should be new
      const firstCall = await dedup.processDiagnostics(diagnostics);
      expect(firstCall.length).toBe(1); // Only unique diagnostic
      
      // Mark as displayed
      dedup.markAsDisplayed(firstCall);
      
      // Second call with same diagnostics - should filter all
      const secondCall = await dedup.processDiagnostics(diagnostics);
      expect(secondCall.length).toBe(0); // All filtered as duplicates
    });

    test("should preserve different diagnostics", async () => {
      const diagnostics = [
        {
          file: "test.ts",
          line: 10,
          column: 5,
          severity: "error" as const,
          message: "Error 1",
          source: "typescript"
        },
        {
          file: "test.ts",
          line: 20,
          column: 10,
          severity: "warning" as const,
          message: "Warning 1",
          source: "typescript"
        },
        {
          file: "other.ts",
          line: 10,
          column: 5,
          severity: "error" as const,
          message: "Error 1",
          source: "typescript"
        }
      ];

      const processed = await dedup.processDiagnostics(diagnostics);
      
      // Should keep all 3 different diagnostics on first run
      expect(processed.length).toBe(3);
    });
  });

  describe("Critical: Cross-file Deduplication", () => {
    test("should handle diagnostics from multiple files", async () => {
      const diagnostics = [
        {
          file: "src/index.ts",
          line: 1,
          column: 1,
          severity: "error" as const,
          message: "Cannot find module 'missing'",
          source: "typescript"
        },
        {
          file: "src/utils.ts",
          line: 1,
          column: 1,
          severity: "error" as const,
          message: "Cannot find module 'missing'",
          source: "typescript"
        }
      ];

      const processed = await dedup.processDiagnostics(diagnostics);
      
      // Different files, same error - should keep both
      expect(processed.length).toBe(2);
    });
  });

  describe("Critical: Recent Diagnostics Tracking", () => {
    test("should track recent diagnostics to prevent spam", async () => {
      const diagnostic = {
        file: "spam.ts",
        line: 5,
        column: 10,
        severity: "error" as const,
        message: "Spam error",
        source: "typescript"
      };

      // First time - should not be filtered
      const firstCall = await dedup.processDiagnostics([diagnostic]);
      expect(firstCall.length).toBe(1);
      
      // Mark as displayed
      dedup.markAsDisplayed(firstCall);
      
      // Immediate duplicate - should be filtered
      const secondCall = await dedup.processDiagnostics([diagnostic]);
      expect(secondCall.length).toBe(0);
    });
  });

  describe("Critical: Performance", () => {
    test("should handle large diagnostic sets efficiently", async () => {
      const largeDiagnostics = [];
      
      // Create 1000 diagnostics with some duplicates
      for (let i = 0; i < 1000; i++) {
        largeDiagnostics.push({
          file: `file${i % 100}.ts`, // 100 unique files
          line: i % 50, // 50 unique lines
          column: i % 10, // 10 unique columns
          severity: (i % 2 === 0 ? "error" : "warning") as "error" | "warning",
          message: `Message ${i % 200}`, // 200 unique messages
          source: "typescript"
        });
      }

      const start = Date.now();
      const processed = await dedup.processDiagnostics(largeDiagnostics);
      const duration = Date.now() - start;
      
      // Should process in under 100ms
      expect(duration).toBeLessThan(100);
      
      // First run should show all unique combinations
      expect(processed.length).toBeGreaterThan(0);
      expect(processed.length).toBeLessThanOrEqual(1000);
    });
  });
});
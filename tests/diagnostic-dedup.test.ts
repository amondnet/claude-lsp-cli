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
    test("should deduplicate identical diagnostics", () => {
      const diagnostics = [
        {
          file: "test.ts",
          line: 10,
          column: 5,
          severity: "error",
          message: "Type 'string' is not assignable to type 'number'",
          source: "typescript"
        },
        {
          file: "test.ts",
          line: 10,
          column: 5,
          severity: "error",
          message: "Type 'string' is not assignable to type 'number'",
          source: "typescript"
        },
        {
          file: "test.ts",
          line: 10,
          column: 5,
          severity: "error",
          message: "Type 'string' is not assignable to type 'number'",
          source: "typescript"
        }
      ];

      const deduplicated = dedup.deduplicateDiagnostics(diagnostics);
      
      // Should only have 1 diagnostic after deduplication
      expect(deduplicated.length).toBe(1);
    });

    test("should preserve different diagnostics", () => {
      const diagnostics = [
        {
          file: "test.ts",
          line: 10,
          column: 5,
          severity: "error",
          message: "Error 1",
          source: "typescript"
        },
        {
          file: "test.ts",
          line: 20,
          column: 10,
          severity: "warning",
          message: "Warning 1",
          source: "typescript"
        },
        {
          file: "other.ts",
          line: 10,
          column: 5,
          severity: "error",
          message: "Error 1",
          source: "typescript"
        }
      ];

      const deduplicated = dedup.deduplicateDiagnostics(diagnostics);
      
      // Should keep all 3 different diagnostics
      expect(deduplicated.length).toBe(3);
    });
  });

  describe("Critical: Cross-file Deduplication", () => {
    test("should handle diagnostics from multiple files", () => {
      const diagnostics = [
        {
          file: "src/index.ts",
          line: 1,
          column: 1,
          severity: "error",
          message: "Cannot find module 'missing'",
          source: "typescript"
        },
        {
          file: "src/utils.ts",
          line: 1,
          column: 1,
          severity: "error",
          message: "Cannot find module 'missing'",
          source: "typescript"
        }
      ];

      const deduplicated = dedup.deduplicateDiagnostics(diagnostics);
      
      // Different files, same error - should keep both
      expect(deduplicated.length).toBe(2);
    });
  });

  describe("Critical: Recent Diagnostics Tracking", () => {
    test("should track recent diagnostics to prevent spam", () => {
      const diagnostic = {
        file: "spam.ts",
        line: 5,
        column: 10,
        severity: "error" as const,
        message: "Spam error",
        source: "typescript"
      };

      // First time - should not be filtered
      expect(dedup.isDuplicateWithinTimeWindow([diagnostic])).toBe(false);
      
      // Store it
      dedup.storeRecentDiagnostics([diagnostic]);
      
      // Immediate duplicate - should be filtered
      expect(dedup.isDuplicateWithinTimeWindow([diagnostic])).toBe(true);
    });
  });

  describe("Critical: Performance", () => {
    test("should handle large diagnostic sets efficiently", () => {
      const largeDiagnostics = [];
      
      // Create 1000 diagnostics with some duplicates
      for (let i = 0; i < 1000; i++) {
        largeDiagnostics.push({
          file: `file${i % 100}.ts`, // 100 unique files
          line: i % 50, // 50 unique lines
          column: i % 10, // 10 unique columns
          severity: i % 2 === 0 ? "error" : "warning",
          message: `Message ${i % 200}`, // 200 unique messages
          source: "typescript"
        });
      }

      const start = Date.now();
      const deduplicated = dedup.deduplicateDiagnostics(largeDiagnostics);
      const duration = Date.now() - start;
      
      // Should process in under 100ms
      expect(duration).toBeLessThan(100);
      
      // Should have deduplicated some
      expect(deduplicated.length).toBeLessThan(1000);
    });
  });
});
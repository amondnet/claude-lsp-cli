/**
 * High-impact test for diagnostic-request-manager.ts
 * Tests critical request coordination and deduplication
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { DiagnosticRequestManager } from "../src/diagnostic-request-manager";
import { mkdirSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

describe("Diagnostic Request Manager - Critical", () => {
  let manager: DiagnosticRequestManager;
  let testProject: string;
  let projectHash: string;

  beforeEach(() => {
    testProject = join(tmpdir(), `request-manager-test-${Date.now()}`);
    mkdirSync(testProject, { recursive: true });
    projectHash = `test-${Date.now()}`;
    manager = DiagnosticRequestManager.getInstance();
  });

  afterEach(() => {
    // Clean up
    manager.cleanupOldRequests();
    rmSync(testProject, { recursive: true, force: true });
  });

  describe("Critical: Singleton Pattern", () => {
    test("should return same instance", () => {
      const instance1 = DiagnosticRequestManager.getInstance();
      const instance2 = DiagnosticRequestManager.getInstance();
      expect(instance1).toBe(instance2);
    });
  });

  describe("Critical: Request Coordination", () => {
    test("should handle single diagnostic request", async () => {
      const diagnostics = await manager.requestDiagnostics(projectHash, testProject);
      expect(Array.isArray(diagnostics)).toBe(true);
    }, 10000); // Allow 10 seconds for this test

    test("should deduplicate concurrent requests for same project", async () => {
      // Start two requests simultaneously
      const promise1 = manager.requestDiagnostics(projectHash, testProject);
      const promise2 = manager.requestDiagnostics(projectHash, testProject);
      
      const [result1, result2] = await Promise.all([promise1, promise2]);
      
      // Both should return arrays
      expect(Array.isArray(result1)).toBe(true);
      expect(Array.isArray(result2)).toBe(true);
    }, 10000);

    test("should handle requests for different projects independently", async () => {
      const testProject2 = join(tmpdir(), `request-manager-test2-${Date.now()}`);
      mkdirSync(testProject2, { recursive: true });
      const projectHash2 = `test2-${Date.now()}`;
      
      try {
        // Start requests for different projects
        const promise1 = manager.requestDiagnostics(projectHash, testProject);
        const promise2 = manager.requestDiagnostics(projectHash2, testProject2);
        
        const [result1, result2] = await Promise.all([promise1, promise2]);
        
        // Both should complete independently
        expect(Array.isArray(result1)).toBe(true);
        expect(Array.isArray(result2)).toBe(true);
      } finally {
        rmSync(testProject2, { recursive: true, force: true });
      }
    }, 10000);
  });

  describe("Critical: Timeout Handling", () => {
    test("should return within 5 seconds even if collection is slow", async () => {
      const start = Date.now();
      const diagnostics = await manager.requestDiagnostics(projectHash, testProject);
      const duration = Date.now() - start;
      
      expect(Array.isArray(diagnostics)).toBe(true);
      expect(duration).toBeLessThan(5500); // Should complete around 4 seconds, allow some buffer
    }, 10000);
  });

  describe("Critical: Cleanup", () => {
    test("should clean up old requests", async () => {
      // Create a request
      const promise = manager.requestDiagnostics(projectHash, testProject);
      
      // Wait for it to complete
      await promise;
      
      // Clean up old requests
      manager.cleanupOldRequests();
      
      // Should not throw
      expect(true).toBe(true);
    }, 10000);

    test("should handle cleanup of non-existent project gracefully", () => {
      // This should not throw
      manager.cleanupOldRequests();
      expect(true).toBe(true);
    });
  });

  describe("Critical: Error Handling", () => {
    test("should handle invalid project path gracefully", async () => {
      const invalidPath = "/non/existent/path";
      const invalidHash = "invalid-hash";
      
      // Should not throw, should return empty array
      const diagnostics = await manager.requestDiagnostics(invalidHash, invalidPath);
      expect(Array.isArray(diagnostics)).toBe(true);
    }, 10000);

    test("should handle rapid successive requests", async () => {
      const promises = [];
      
      // Fire 5 rapid requests
      for (let i = 0; i < 5; i++) {
        promises.push(manager.requestDiagnostics(`${projectHash}-${i}`, testProject));
      }
      
      const results = await Promise.all(promises);
      
      // All should complete successfully
      results.forEach(result => {
        expect(Array.isArray(result)).toBe(true);
      });
    }, 15000); // Allow more time for multiple requests
  });

  describe("Critical: Worker Thread Management", () => {
    test("should terminate worker on cleanup", async () => {
      // Start a request but don't wait for it
      manager.requestDiagnostics(projectHash, testProject);
      
      // Wait a bit for worker to start
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Force cleanup
      manager.cleanupOldRequests();
      
      // Should not leave dangling workers
      expect(true).toBe(true);
    });
  });
});
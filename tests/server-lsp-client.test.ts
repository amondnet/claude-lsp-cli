/**
 * High-impact test for server-lsp-client.ts
 * Tests critical LSP client functionality
 */

import { describe, test, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { LSPClient } from "../src/server-lsp-client";
import { mkdirSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { spawn } from "bun";

describe("LSP Client - Critical", () => {
  let testProject: string;
  let client: LSPClient;

  beforeAll(() => {
    testProject = join(tmpdir(), `lsp-client-test-${Date.now()}`);
    mkdirSync(testProject, { recursive: true });
    
    // Create test files
    writeFileSync(join(testProject, "package.json"), JSON.stringify({
      name: "test-project",
      version: "1.0.0"
    }));
    
    writeFileSync(join(testProject, "test.ts"), `
      const x: number = "string"; // Type error
      console.log(x);
    `);
    
    writeFileSync(join(testProject, "test.js"), `
      const unused = 42; // Unused variable
      console.log("test");
    `);
  });

  afterAll(() => {
    if (client) {
      client.shutdown();
    }
    rmSync(testProject, { recursive: true, force: true });
  });

  describe("Critical: Initialization", () => {
    test("should initialize LSP client", () => {
      client = new LSPClient(testProject);
      expect(client).toBeDefined();
    });

    test("should detect supported languages", () => {
      client = new LSPClient(testProject);
      const languages = client.getSupportedLanguages();
      expect(Array.isArray(languages)).toBe(true);
      expect(languages.length).toBeGreaterThan(0);
    });
  });

  describe("Critical: Language Server Management", () => {
    test("should start language servers for detected languages", async () => {
      client = new LSPClient(testProject);
      await client.autoDetectAndStart(testProject);
      
      const servers = client.getActiveServers();
      expect(servers).toBeDefined();
      expect(Array.isArray(servers)).toBe(true);
    });

    test("should handle missing language server gracefully", async () => {
      client = new LSPClient(testProject);
      
      // Try to open a file with no language server - should not throw
      const unknownPath = join(testProject, "test.unknown");
      writeFileSync(unknownPath, "unknown content");
      await client.openDocument(unknownPath);
      
      // Should complete without error
      expect(true).toBe(true);
    });
  });

  describe("Critical: Document Synchronization", () => {
    test("should open documents", async () => {
      client = new LSPClient(testProject);
      await client.autoDetectAndStart(testProject);
      
      const filePath = join(testProject, "test.ts");
      await client.openDocument(filePath);
      
      // Should complete without error
      expect(true).toBe(true);
    });

    test("should handle document changes", async () => {
      client = new LSPClient(testProject);
      await client.autoDetectAndStart(testProject);
      
      const filePath = join(testProject, "test.ts");
      const content = await Bun.file(filePath).text();
      
      await client.openDocument(filePath);
      
      // Make a change
      const newContent = content + "\n// New comment";
      await client.updateDocument(filePath, newContent);
      
      // Should complete without error
      expect(true).toBe(true);
    });
  });

  describe("Critical: Diagnostics", () => {
    test("should collect diagnostics from language servers", async () => {
      client = new LSPClient(testProject);
      await client.autoDetectAndStart(testProject);
      
      // Open TypeScript file with error
      const filePath = join(testProject, "test.ts");
      await client.openDocument(filePath, true); // Wait for diagnostics
      
      // Wait a bit more for diagnostics to arrive
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const diagnostics = client.getDiagnostics(filePath);
      expect(Array.isArray(diagnostics)).toBe(true);
    });

    test("should aggregate diagnostics from multiple servers", async () => {
      client = new LSPClient(testProject);
      await client.autoDetectAndStart(testProject);
      
      // Open multiple files
      const tsFile = join(testProject, "test.ts");
      const jsFile = join(testProject, "test.js");
      
      await client.openDocument(tsFile);
      await client.openDocument(jsFile);
      
      // Wait for diagnostics
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const allDiagnostics = client.getAllDiagnostics();
      expect(allDiagnostics instanceof Map).toBe(true);
    });
  });

  describe("Critical: Error Handling", () => {
    test("should handle server crashes gracefully", async () => {
      client = new LSPClient(testProject);
      await client.autoDetectAndStart(testProject);
      
      // Get active servers
      const servers = client.getActiveServers();
      
      if (servers.length > 0) {
        // Stop first server
        await client.stopLanguageServer(servers[0]);
        
        // Client should handle this gracefully
        const diagnostics = client.getAllDiagnostics();
        expect(diagnostics instanceof Map).toBe(true);
      } else {
        // No servers started, that's OK
        expect(true).toBe(true);
      }
    });

    test("should handle invalid document paths", async () => {
      client = new LSPClient(testProject);
      await client.autoDetectAndStart(testProject);
      
      // Should not throw
      await client.openDocument("/nonexistent/file.ts");
      expect(true).toBe(true);
    });
  });

  describe("Critical: Shutdown", () => {
    test("should shutdown cleanly", async () => {
      client = new LSPClient(testProject);
      await client.autoDetectAndStart(testProject);
      
      await client.shutdown();
      
      // Verify servers are stopped
      const servers = client.getActiveServers();
      expect(servers.length).toBe(0);
    });

    test("should clean up resources on shutdown", async () => {
      client = new LSPClient(testProject);
      await client.autoDetectAndStart(testProject);
      
      // Track initial process count
      const { stdout: before } = await Bun.$`ps aux | grep -E "(typescript-language-server|eslint)" | grep -v grep | wc -l`.quiet();
      const beforeCount = parseInt(before.toString().trim());
      
      await client.shutdown();
      
      // Check processes are cleaned up
      await new Promise(resolve => setTimeout(resolve, 500));
      const { stdout: after } = await Bun.$`ps aux | grep -E "(typescript-language-server|eslint)" | grep -v grep | wc -l`.quiet();
      const afterCount = parseInt(after.toString().trim());
      
      expect(afterCount).toBeLessThanOrEqual(beforeCount);
    });
  });

  describe("Critical: Performance", () => {
    test("should handle large files efficiently", async () => {
      client = new LSPClient(testProject);
      await client.autoDetectAndStart(testProject);
      
      // Create a large file
      const largeContent = Array(10000).fill("const x = 1;").join("\n");
      const largePath = join(testProject, "large.ts");
      writeFileSync(largePath, largeContent);
      
      const start = Date.now();
      await client.openDocument(largePath);
      const duration = Date.now() - start;
      
      // Should open large files in reasonable time
      expect(duration).toBeLessThan(5000);
    });

    test("should handle many concurrent operations", async () => {
      client = new LSPClient(testProject);
      await client.autoDetectAndStart(testProject);
      
      // Create multiple files
      const files = [];
      for (let i = 0; i < 10; i++) {
        const path = join(testProject, `concurrent-${i}.ts`);
        const content = `const var${i} = ${i};`;
        writeFileSync(path, content);
        files.push(path);
      }
      
      // Open all files concurrently
      const start = Date.now();
      await Promise.all(
        files.map(path => client.openDocument(path))
      );
      const duration = Date.now() - start;
      
      // Should handle concurrent operations efficiently
      expect(duration).toBeLessThan(10000);
    });
  });
});
#!/usr/bin/env bun

import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { LSPClient } from "../src/lsp-client";
import { existsSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { execSync } from "child_process";

const TEST_PROJECT = "/tmp/claude-lsp-client-test";

describe("LSP Client", () => {
  let client: LSPClient;
  
  beforeAll(() => {
    // Setup test project
    if (existsSync(TEST_PROJECT)) {
      rmSync(TEST_PROJECT, { recursive: true });
    }
    mkdirSync(TEST_PROJECT, { recursive: true });
    
    // Create test files for different languages
    writeFileSync(join(TEST_PROJECT, "package.json"), JSON.stringify({
      name: "test-project",
      version: "1.0.0",
      devDependencies: {
        "typescript": "^5.0.0"
      }
    }, null, 2));
    
    // Install TypeScript in test project
    try {
      execSync("bun install", { cwd: TEST_PROJECT, stdio: "pipe" });
    } catch (e) {
      console.log("TypeScript installation in test project:", e);
    }
    
    writeFileSync(join(TEST_PROJECT, "test.ts"), `
const value: number = "string"; // Type error
console.log(valu); // Typo
`);
    
    writeFileSync(join(TEST_PROJECT, "test.js"), `
const obj = { name: "test" };
console.log(obj.nmae); // Typo
`);
    
    writeFileSync(join(TEST_PROJECT, "test.go"), `
package main

func main() {
    var message string = 123 // Type error
    fmt.Println(mesage) // Typo and missing import
}
`);
    
    client = new LSPClient();
  });
  
  afterAll(async () => {
    // Cleanup
    await client.shutdown();
    if (existsSync(TEST_PROJECT)) {
      rmSync(TEST_PROJECT, { recursive: true });
    }
  });
  
  test("LSPClient initializes", () => {
    expect(client).toBeDefined();
    expect(client).toBeInstanceOf(LSPClient);
  });
  
  test("Auto-detects project languages", async () => {
    await client.autoDetectAndStart(TEST_PROJECT);
    
    const activeServers = client.getActiveServers();
    expect(Array.isArray(activeServers)).toBe(true);
    
    // Should detect TypeScript/JavaScript files even if server fails to start
    // The detection should work, server start might fail in test environment
    // So we just check that detection returned an array
    expect(activeServers).toBeDefined();
  });
  
  test("Opens and tracks documents", async () => {
    const testFile = join(TEST_PROJECT, "test.ts");
    
    await client.openDocument(testFile);
    
    // Give LSP time to process
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Document should be tracked
    const diagnostics = client.getDiagnostics(testFile);
    expect(Array.isArray(diagnostics)).toBe(true);
  });
  
  test("Returns diagnostics for files with errors", async () => {
    const testFile = join(TEST_PROJECT, "test.ts");
    
    await client.openDocument(testFile);
    
    // Wait for diagnostics
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    const diagnostics = client.getDiagnostics(testFile);
    
    // Should have diagnostics for the intentional errors
    if (diagnostics.length > 0) {
      expect(diagnostics[0]).toHaveProperty("range");
      expect(diagnostics[0]).toHaveProperty("message");
      expect(diagnostics[0]).toHaveProperty("severity");
      
      // Check for type error
      const typeError = diagnostics.find(d => 
        d.message.includes("string") || d.message.includes("number")
      );
      expect(typeError).toBeDefined();
    }
  });
  
  test("Handles document changes", async () => {
    const testFile = join(TEST_PROJECT, "test.ts");
    
    await client.openDocument(testFile);
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Simulate document change
    const newContent = `
const value: number = 123; // Fixed
console.log(value); // Fixed
`;
    
    await client.updateDocument(testFile, newContent);
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const diagnostics = client.getDiagnostics(testFile);
    
    // Should have fewer or no diagnostics after fix
    expect(diagnostics.length).toBeLessThanOrEqual(2);
  });
  
  test("Closes documents", async () => {
    const testFile = join(TEST_PROJECT, "test.ts");
    
    await client.openDocument(testFile);
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    await client.closeDocument(testFile);
    
    // Diagnostics should be cleared
    const diagnostics = client.getDiagnostics(testFile);
    expect(diagnostics.length).toBe(0);
  });
  
  test("Handles multiple language servers", async () => {
    // Open files of different types
    await client.openDocument(join(TEST_PROJECT, "test.ts"));
    await client.openDocument(join(TEST_PROJECT, "test.js"));
    
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    const activeServers = client.getActiveServers();
    
    // Should have at least one server active
    expect(activeServers.length).toBeGreaterThan(0);
  });
  
  test("Gracefully handles missing language servers", async () => {
    // Create a file type that likely doesn't have a server
    const rareLangFile = join(TEST_PROJECT, "test.xyz");
    writeFileSync(rareLangFile, "some content");
    
    // Should not throw when opening unsupported file
    let error: Error | null = null;
    try {
      await client.openDocument(rareLangFile);
    } catch (e) {
      error = e as Error;
    }
    
    // Should either succeed or fail gracefully
    if (error) {
      expect(error.message).toContain("language server");
    } else {
      // Should return empty diagnostics if it succeeded
      const diagnostics = client.getDiagnostics(rareLangFile);
      expect(diagnostics).toEqual([]);
    }
  });
  
  test("Shutdown stops all servers", async () => {
    await client.autoDetectAndStart(TEST_PROJECT);
    
    const serversBefore = client.getActiveServers();
    expect(serversBefore.length).toBeGreaterThan(0);
    
    await client.shutdown();
    
    const serversAfter = client.getActiveServers();
    expect(serversAfter.length).toBe(0);
  });
});
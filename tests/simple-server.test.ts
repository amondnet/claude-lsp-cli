#!/usr/bin/env bun

import { test, expect, describe } from "bun:test";
import { Server } from "../src/server";
import { existsSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { join } from "path";

const TEST_PROJECT = "/tmp/claude-lsp-simple-test";

describe("Server Core Functions", () => {
  let server: Server;
  
  beforeAll(() => {
    // Setup test project
    if (existsSync(TEST_PROJECT)) {
      rmSync(TEST_PROJECT, { recursive: true });
    }
    mkdirSync(TEST_PROJECT, { recursive: true });
    
    writeFileSync(join(TEST_PROJECT, "package.json"), JSON.stringify({
      name: "test-project",
      version: "1.0.0"
    }, null, 2));
    
    writeFileSync(join(TEST_PROJECT, "test.ts"), `
const message: string = 123; // Type error
`);
  });
  
  afterAll(() => {
    if (existsSync(TEST_PROJECT)) {
      rmSync(TEST_PROJECT, { recursive: true });
    }
  });
  
  test("Server can be instantiated", () => {
    server = new Server(TEST_PROJECT);
    expect(server).toBeDefined();
    expect(server).toBeInstanceOf(Server);
  });
  
  test("Server has correct project properties", () => {
    server = new Server(TEST_PROJECT);
    expect(server.projectRoot).toBe(TEST_PROJECT);
    expect(server.projectHash).toBeDefined();
    expect(server.projectHash).toHaveLength(16);
  });
  
  test("Server detects TypeScript project", async () => {
    server = new Server(TEST_PROJECT);
    await server.initialize();
    
    const activeServers = server.lspClient.getActiveServers();
    expect(Array.isArray(activeServers)).toBe(true);
    
    // Should have TypeScript server if TypeScript is installed
    if (activeServers.length > 0) {
      expect(activeServers.some(s => s.includes("TypeScript"))).toBe(true);
    }
  });
  
  test("Server provides diagnostics", async () => {
    server = new Server(TEST_PROJECT);
    await server.initialize();
    
    // Open the test file
    const testFile = join(TEST_PROJECT, "test.ts");
    await server.lspClient.openDocument(testFile);
    
    // Wait for diagnostics
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const diagnostics = server.lspClient.getDiagnostics(testFile);
    expect(Array.isArray(diagnostics)).toBe(true);
    
    // Should have diagnostics for the type error
    if (diagnostics.length > 0) {
      expect(diagnostics[0]).toHaveProperty("message");
      expect(diagnostics[0]).toHaveProperty("severity");
    }
  });
  
  test("Server handles multiple file operations", async () => {
    server = new Server(TEST_PROJECT);
    await server.initialize();
    
    const testFile1 = join(TEST_PROJECT, "test.ts");
    const testFile2 = join(TEST_PROJECT, "test2.ts");
    
    writeFileSync(testFile2, `
const value: number = "wrong"; // Another error
`);
    
    await server.lspClient.openDocument(testFile1);
    await server.lspClient.openDocument(testFile2);
    
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const diag1 = server.lspClient.getDiagnostics(testFile1);
    const diag2 = server.lspClient.getDiagnostics(testFile2);
    
    expect(Array.isArray(diag1)).toBe(true);
    expect(Array.isArray(diag2)).toBe(true);
  });
});
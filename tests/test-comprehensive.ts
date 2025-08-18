#!/usr/bin/env bun

import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { LSPClient } from "../src/lsp-client";
import { spawn } from "child_process";
import { existsSync, mkdirSync, rmSync } from "fs";
import { join } from "path";
import { $ } from "bun";
import { createHash } from "crypto";

// Test projects setup
const TEST_ROOT = "/tmp/lsp-test-projects";
const TS_PROJECT = join(TEST_ROOT, "typescript-project");
const PY_PROJECT = join(TEST_ROOT, "python-project");
const NESTED_PROJECT = join(TEST_ROOT, "nested", "deep", "project");

async function setupTestProjects() {
  // Clean and create test directories
  if (existsSync(TEST_ROOT)) {
    rmSync(TEST_ROOT, { recursive: true });
  }
  mkdirSync(TEST_ROOT, { recursive: true });
  
  // TypeScript project with .git
  mkdirSync(TS_PROJECT, { recursive: true });
  mkdirSync(join(TS_PROJECT, ".git"));
  
  await Bun.write(join(TS_PROJECT, "tsconfig.json"), JSON.stringify({
    compilerOptions: {
      target: "ES2020",
      module: "commonjs",
      strict: true,
      esModuleInterop: true,
      skipLibCheck: true,
      forceConsistentCasingInFileNames: true
    }
  }, null, 2));
  
  await Bun.write(join(TS_PROJECT, "test.ts"), `
// TypeScript test file with errors
const x: number = "string"; // Type error
const y = undefinedVariable; // Undefined variable
function test(): string {
  return 123; // Wrong return type
}
`);
  
  // Python project with .git
  mkdirSync(PY_PROJECT, { recursive: true });
  mkdirSync(join(PY_PROJECT, ".git"));
  
  await Bun.write(join(PY_PROJECT, "requirements.txt"), "pytest\nnumpy\n");
  
  await Bun.write(join(PY_PROJECT, "test.py"), `
# Python test file with errors
import json  # unused import should be caught

def test_function(x: int) -> str:
    undefined_var = missing_variable  # Undefined variable
    return x  # Type error: returning int instead of str

result = json.loads(invalid_json)  # undefined variable
`);
  
  // Nested project (project files in subdirectory, .git at root)
  mkdirSync(NESTED_PROJECT, { recursive: true });
  mkdirSync(join(TEST_ROOT, "nested", ".git"));
  
  await Bun.write(join(NESTED_PROJECT, "package.json"), JSON.stringify({
    name: "nested-project",
    version: "1.0.0"
  }));
  
  await Bun.write(join(NESTED_PROJECT, "index.js"), `
// JavaScript file with issues
const a = undefinedThing;
console.log(nonExistent);
`);
}

async function cleanupTestProjects() {
  // Kill any test LSP servers
  const projectHashes = [
    createHash("md5").update(TS_PROJECT).digest("hex").substring(0, 8),
    createHash("md5").update(PY_PROJECT).digest("hex").substring(0, 8),
    createHash("md5").update(join(TEST_ROOT, "nested")).digest("hex").substring(0, 8)
  ];
  
  for (const hash of projectHashes) {
    const pidFile = `/tmp/claude-lsp-${hash}.pid`;
    const socketFile = `/tmp/claude-lsp-${hash}.sock`;
    
    if (existsSync(pidFile)) {
      try {
        const pid = await Bun.file(pidFile).text();
        await $`kill ${pid.trim()}`.quiet();
      } catch {}
      rmSync(pidFile, { force: true });
    }
    
    if (existsSync(socketFile)) {
      rmSync(socketFile, { force: true });
    }
  }
  
  // Clean test directories
  if (existsSync(TEST_ROOT)) {
    rmSync(TEST_ROOT, { recursive: true });
  }
}

describe("LSP Client Implementation", () => {
  beforeAll(async () => {
    await setupTestProjects();
  });
  
  afterAll(async () => {
    await cleanupTestProjects();
  });
  
  describe("TypeScript Language Server", () => {
    test("should initialize and detect TypeScript errors", async () => {
      const client = new LSPClient();
      
      // Start TypeScript server
      await client.startTypeScriptServer(TS_PROJECT);
      
      // Open file with errors
      const testFile = join(TS_PROJECT, "test.ts");
      await client.openDocument(testFile, "typescript");
      
      // Wait for diagnostics
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // Get diagnostics
      const diagnostics = client.getDiagnostics(testFile);
      
      // Should detect at least the type errors
      expect(diagnostics.length).toBeGreaterThanOrEqual(2);
      
      // Check for specific errors
      const hasTypeError = diagnostics.some(d => 
        d.message.includes("string") && d.message.includes("number")
      );
      const hasUndefinedError = diagnostics.some(d => 
        d.message.includes("undefinedVariable")
      );
      
      expect(hasTypeError || hasUndefinedError).toBe(true);
      
      await client.shutdown();
    }, 10000);
  });
  
  describe("Python Language Server (Pyright)", () => {
    test("should initialize and detect Python errors", async () => {
      const client = new LSPClient();
      
      // Start Python server
      await client.startPythonServer(PY_PROJECT);
      
      // Open file with errors
      const testFile = join(PY_PROJECT, "test.py");
      await client.openDocument(testFile, "python");
      
      // Wait for diagnostics
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // Get diagnostics
      const diagnostics = client.getDiagnostics(testFile);
      
      // Should detect errors
      expect(diagnostics.length).toBeGreaterThanOrEqual(2);
      
      // Check for specific errors
      const hasUndefinedError = diagnostics.some(d => 
        d.message.includes("missing_variable") || 
        d.message.includes("not defined")
      );
      const hasTypeError = diagnostics.some(d => 
        d.message.includes("int") && d.message.includes("str")
      );
      
      expect(hasUndefinedError).toBe(true);
      console.log(`Found ${diagnostics.length} Python diagnostics`);
      
      await client.shutdown();
    }, 10000);
  });
  
  describe("Project Root Detection", () => {
    test("should find .git at parent directory", async () => {
      // Import the findProjectRoot function
      const { findProjectRoot } = await import("./src/manager.ts");
      
      // Test finding project root from nested file
      const projectInfo = findProjectRoot(join(NESTED_PROJECT, "index.js"));
      
      expect(projectInfo).not.toBeNull();
      expect(projectInfo!.root).toBe(join(TEST_ROOT, "nested"));
      expect(projectInfo!.hasTypeScript).toBe(true); // Has package.json
    });
    
    test("should detect project languages correctly", async () => {
      const { findProjectRoot } = await import("./src/manager.ts");
      
      // Test TypeScript project
      const tsProject = findProjectRoot(TS_PROJECT);
      expect(tsProject).not.toBeNull();
      expect(tsProject!.hasTypeScript).toBe(true);
      expect(tsProject!.hasPython).toBe(false);
      
      // Test Python project
      const pyProject = findProjectRoot(PY_PROJECT);
      expect(pyProject).not.toBeNull();
      expect(pyProject!.hasPython).toBe(true);
      expect(pyProject!.hasTypeScript).toBe(false);
    });
  });
  
  describe("Project Isolation", () => {
    test("should create unique sockets per project", async () => {
      const { startLSPServer, findProjectRoot } = await import("./src/manager.ts");
      
      const tsInfo = findProjectRoot(TS_PROJECT)!;
      const pyInfo = findProjectRoot(PY_PROJECT)!;
      
      // Hashes should be different
      expect(tsInfo.hash).not.toBe(pyInfo.hash);
      
      // Start servers
      await startLSPServer(tsInfo);
      await startLSPServer(pyInfo);
      
      // Wait for servers to start
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Check unique sockets exist
      const tsSocket = `/tmp/claude-lsp-${tsInfo.hash}.sock`;
      const pySocket = `/tmp/claude-lsp-${pyInfo.hash}.sock`;
      
      expect(existsSync(tsSocket)).toBe(true);
      expect(existsSync(pySocket)).toBe(true);
      expect(tsSocket).not.toBe(pySocket);
    }, 10000);
  });
  
  describe("Auto-start on file edit", () => {
    test("should auto-start LSP when file is edited", async () => {
      const { autoStart, findProjectRoot, isLSPRunning } = await import("./src/manager.ts");
      
      const testFile = join(TS_PROJECT, "new-file.ts");
      await Bun.write(testFile, "const x = 1;");
      
      // Auto-start for the file
      await autoStart(testFile);
      
      // Wait for server to start
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Check if running
      const projectInfo = findProjectRoot(testFile)!;
      const running = await isLSPRunning(projectInfo.hash);
      
      expect(running).toBe(true);
    }, 10000);
  });
});

// Run tests
console.log("Running comprehensive LSP tests...");
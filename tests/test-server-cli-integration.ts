#!/usr/bin/env bun

import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { spawn, ChildProcess } from "child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { $ } from "bun";

const TEST_PROJECT = "/tmp/claude-lsp-test-project";
const SERVER_BINARY = "./bin/claude-lsp-server";
const CLI_BINARY = "./bin/claude-lsp-cli";

describe("Server and CLI Integration Tests", () => {
  let serverProcess: ChildProcess | null = null;

  beforeAll(async () => {
    // Clean up any existing test project
    if (existsSync(TEST_PROJECT)) {
      rmSync(TEST_PROJECT, { recursive: true });
    }
    
    // Create test project
    mkdirSync(TEST_PROJECT, { recursive: true });
    
    // Create TypeScript files with errors
    writeFileSync(join(TEST_PROJECT, "package.json"), JSON.stringify({
      name: "test-project",
      version: "1.0.0",
      devDependencies: {
        "typescript": "^5.0.0"
      }
    }));
    
    writeFileSync(join(TEST_PROJECT, "tsconfig.json"), JSON.stringify({
      compilerOptions: {
        target: "ES2020",
        strict: true,
        noImplicitAny: true
      }
    }));
    
    // File with TypeScript errors
    writeFileSync(join(TEST_PROJECT, "test.ts"), `
// TypeScript errors for testing
const x: string = 123; // Type error
const y = undefinedVariable; // Undefined variable
function badFunction(): string {
  return 123; // Wrong return type
}
`);

    // Install TypeScript in test project
    await $`cd ${TEST_PROJECT} && bun install`.quiet();
  });

  afterAll(async () => {
    // Stop server if running
    if (serverProcess) {
      serverProcess.kill();
      serverProcess = null;
    }
    
    // Clean up test project
    if (existsSync(TEST_PROJECT)) {
      rmSync(TEST_PROJECT, { recursive: true });
    }
  });

  describe("Server Binary", () => {
    test("should start server and create Unix socket", async () => {
      expect(existsSync(SERVER_BINARY)).toBe(true);
      
      // Start server in background
      serverProcess = spawn(SERVER_BINARY, [TEST_PROJECT], {
        stdio: "pipe"
      });
      
      // Wait for server to start
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // Check if Unix socket was created
      const projectHash = require("crypto").createHash("md5")
        .update(TEST_PROJECT)
        .digest("hex")
        .substring(0, 8);
      
      const socketPath = `/tmp/claude-lsp-${projectHash}.sock`;
      expect(existsSync(socketPath)).toBe(true);
    }, 10000);

    test("should respond to health check via Unix socket", async () => {
      const projectHash = require("crypto").createHash("md5")
        .update(TEST_PROJECT)
        .digest("hex")
        .substring(0, 8);
      
      const socketPath = `/tmp/claude-lsp-${projectHash}.sock`;
      
      try {
        const response = await fetch("http://localhost/health", {
          // @ts-ignore - Bun supports unix sockets
          unix: socketPath
        });
        
        expect(response.ok).toBe(true);
        const data = await response.json();
        expect(data.status).toBe("healthy");
        expect(data.project).toBe(TEST_PROJECT);
      } catch (error) {
        console.error("Health check failed:", error);
        throw error;
      }
    });

    test("should return diagnostics via Unix socket", async () => {
      const projectHash = require("crypto").createHash("md5")
        .update(TEST_PROJECT)
        .digest("hex")
        .substring(0, 8);
      
      const socketPath = `/tmp/claude-lsp-${projectHash}.sock`;
      
      // Wait a bit for TypeScript server to analyze the file
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      try {
        const response = await fetch("http://localhost/diagnostics/all", {
          // @ts-ignore - Bun supports unix sockets
          unix: socketPath
        });
        
        expect(response.ok).toBe(true);
        const data = await response.json();
        expect(data).toHaveProperty("diagnostics");
        expect(data).toHaveProperty("timestamp");
        expect(Array.isArray(data.diagnostics)).toBe(true);
        
        // Should have some diagnostics due to TypeScript errors
        if (data.diagnostics.length > 0) {
          const diagnostic = data.diagnostics[0];
          expect(diagnostic).toHaveProperty("file");
          expect(diagnostic).toHaveProperty("line");
          expect(diagnostic).toHaveProperty("message");
          expect(diagnostic).toHaveProperty("severity");
        }
      } catch (error) {
        console.error("Diagnostics query failed:", error);
        throw error;
      }
    });
  });

  describe("CLI Binary", () => {
    test("should show usage when called without arguments", async () => {
      const result = await $`${CLI_BINARY}`.nothrow();
      expect(result.exitCode).toBe(1);
      expect(result.stderr.toString()).toContain("Claude LSP CLI");
      expect(result.stderr.toString()).toContain("Usage:");
      expect(result.stderr.toString()).toContain("hook <event-type>");
    });

    test("should query diagnostics from running server", async () => {
      const result = await $`${CLI_BINARY} diagnostics ${TEST_PROJECT}`.nothrow();
      expect(result.exitCode).toBe(0);
      
      const output = JSON.parse(result.stdout.toString());
      expect(output).toHaveProperty("diagnostics");
      expect(output).toHaveProperty("timestamp");
      expect(Array.isArray(output.diagnostics)).toBe(true);
    });

    test("should handle hook events (mock PostToolUse)", async () => {
      // Create mock hook data
      const mockHookData = JSON.stringify({
        event: "PostToolUse",
        tool: "Edit",
        parameters: {
          file_path: join(TEST_PROJECT, "test.ts")
        },
        working_directory: TEST_PROJECT
      });
      
      // Test hook handling
      const proc = spawn(CLI_BINARY, ["hook", "PostToolUse"], {
        stdio: "pipe"
      });
      
      // Send mock data to stdin
      proc.stdin?.write(mockHookData);
      proc.stdin?.end();
      
      // Wait for completion
      await new Promise((resolve, reject) => {
        proc.on("close", (code) => {
          if (code === 0 || code === 2) { // Exit 2 is expected for PostToolUse hooks
            resolve(code);
          } else {
            reject(new Error(`Hook failed with exit code ${code}`));
          }
        });
        
        // Timeout after 10 seconds
        setTimeout(() => {
          proc.kill();
          reject(new Error("Hook test timed out"));
        }, 10000);
      });
    }, 15000);

    test("should fail gracefully when server not running", async () => {
      // Stop the server first
      if (serverProcess) {
        serverProcess.kill();
        serverProcess = null;
        
        // Wait for cleanup
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
      const result = await $`${CLI_BINARY} diagnostics ${TEST_PROJECT}`.nothrow();
      expect(result.exitCode).toBe(1);
      
      const output = JSON.parse(result.stdout.toString());
      expect(output.error).toBe("CONNECTION_FAILED");
    });
  });

  describe("Server-CLI Integration", () => {
    test("should work end-to-end: start server -> query via CLI", async () => {
      // Start server again
      serverProcess = spawn(SERVER_BINARY, [TEST_PROJECT], {
        stdio: "pipe"
      });
      
      // Wait for server to start
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // Query via CLI
      const result = await $`${CLI_BINARY} diagnostics ${TEST_PROJECT}`.nothrow();
      expect(result.exitCode).toBe(0);
      
      const output = JSON.parse(result.stdout.toString());
      expect(output).toHaveProperty("diagnostics");
      expect(output).toHaveProperty("timestamp");
    }, 10000);
  });
});
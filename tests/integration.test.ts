#!/usr/bin/env bun

import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { spawn } from "child_process";
import { existsSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { join } from "path";

const TEST_PROJECT = "/tmp/claude-lsp-integration-test";
const projectRoot = join(import.meta.dir, "..");

describe("LSP Integration Tests", () => {
  beforeAll(() => {
    // Clean up and create test project
    if (existsSync(TEST_PROJECT)) {
      rmSync(TEST_PROJECT, { recursive: true });
    }
    mkdirSync(TEST_PROJECT, { recursive: true });
    
    // Create TypeScript project files
    writeFileSync(join(TEST_PROJECT, "package.json"), JSON.stringify({
      name: "test-project",
      version: "1.0.0",
      devDependencies: {
        "typescript": "^5.0.0"
      }
    }, null, 2));
    
    writeFileSync(join(TEST_PROJECT, "tsconfig.json"), JSON.stringify({
      compilerOptions: {
        target: "ES2022",
        module: "ESNext",
        strict: true
      }
    }, null, 2));
    
    // Create TypeScript file with intentional errors
    writeFileSync(join(TEST_PROJECT, "test.ts"), `
// This file has intentional errors for testing
const message: string = 123; // Type error
console.log(mesage); // Typo error

function add(a: number, b: number): number {
  return a + b;
}

add("1", "2"); // Type error
`);
    
    // Create Python file with errors
    writeFileSync(join(TEST_PROJECT, "test.py"), `
# This file has intentional errors for testing
def add(a: int, b: int) -> int:
    return a + b

result = add("1", "2")  # Type error
print(reslt)  # Name error
`);
  });
  
  afterAll(() => {
    // Clean up test project
    if (existsSync(TEST_PROJECT)) {
      rmSync(TEST_PROJECT, { recursive: true });
    }
  });
  
  test("LSP server starts and responds to health check", async () => {
    // Start the server
    const serverProcess = spawn("bun", ["run", join(projectRoot, "src/server.ts"), TEST_PROJECT], {
      detached: true,
      stdio: "ignore"
    });
    
    // Give server time to start
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    try {
      // Calculate project hash (first 16 chars of SHA-256)
      const { createHash } = await import("crypto");
      const projectHash = createHash('sha256').update(TEST_PROJECT).digest('hex').substring(0, 16);
      
      // Determine socket path
      const socketDir = process.platform === 'darwin' 
        ? `${process.env.HOME}/Library/Application Support/claude-lsp/run`
        : `${process.env.HOME}/.claude-lsp/run`;
      const socketPath = `${socketDir}/claude-lsp-${projectHash}.sock`;
      
      // Check health endpoint
      const response = await fetch("http://localhost/health", {
        unix: socketPath
      } as any);
      
      expect(response.ok).toBe(true);
      const health = await response.json();
      expect(health.status).toBe("healthy");
      expect(health.projectHash).toBe(projectHash);
      
      // Check diagnostics
      const diagResponse = await fetch("http://localhost/diagnostics/all", {
        unix: socketPath
      } as any);
      
      expect(diagResponse.ok).toBe(true);
      const diags = await diagResponse.json();
      expect(diags).toHaveProperty("diagnostics");
      expect(diags).toHaveProperty("timestamp");
      
      // We should have diagnostics for TypeScript errors
      const diagnostics = diags.diagnostics;
      expect(Array.isArray(diagnostics)).toBe(true);
      
      // Should detect at least some errors
      const tsErrors = diagnostics.filter((d: any) => d.file === "test.ts");
      expect(tsErrors.length).toBeGreaterThan(0);
      
      // Should find the type error on line 3
      const typeError = tsErrors.find((d: any) => d.line === 3);
      expect(typeError).toBeDefined();
      expect(typeError?.severity).toBe("error");
      
    } finally {
      // Kill the server process
      try {
        process.kill(-serverProcess.pid!, 'SIGTERM');
      } catch {
        // Process may have already exited
      }
    }
  }, 10000); // 10 second timeout
  
  test("CLI diagnostics command works", async () => {
    // Build the CLI if needed
    const cliPath = join(projectRoot, "bin/claude-lsp-cli");
    if (!existsSync(cliPath)) {
      console.log("Building CLI binary...");
      const buildProcess = spawn("bun", ["run", "build:cli"], {
        cwd: projectRoot,
        stdio: "inherit"
      });
      await new Promise((resolve, reject) => {
        buildProcess.on("exit", (code) => {
          if (code === 0) resolve(null);
          else reject(new Error(`Build failed with code ${code}`));
        });
      });
    }
    
    // Run diagnostics command
    const result = await new Promise<{stdout: string, stderr: string, code: number}>((resolve) => {
      const proc = spawn(cliPath, ["diagnostics", TEST_PROJECT], {
        cwd: projectRoot
      });
      
      let stdout = "";
      let stderr = "";
      
      proc.stdout?.on("data", (data) => {
        stdout += data.toString();
      });
      
      proc.stderr?.on("data", (data) => {
        stderr += data.toString();
      });
      
      proc.on("exit", (code) => {
        resolve({ stdout, stderr, code: code || 0 });
      });
    });
    
    // Should complete successfully
    expect(result.code).toBe(0);
    
    // Should return JSON with diagnostics
    const output = JSON.parse(result.stdout);
    expect(output).toHaveProperty("diagnostics");
    expect(Array.isArray(output.diagnostics)).toBe(true);
  }, 15000);
});
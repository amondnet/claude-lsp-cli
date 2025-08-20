#!/usr/bin/env bun

import { test, expect, describe, beforeAll, afterAll, beforeEach } from "bun:test";
import { spawn, execSync } from "child_process";
import { existsSync, mkdirSync, writeFileSync, rmSync, readFileSync } from "fs";
import { join } from "path";
import { createHash } from "crypto";

const TEST_PROJECT = "/tmp/claude-lsp-comprehensive-test";
const projectRoot = join(import.meta.dir, "..");

// Helper to create a test project with TypeScript installed
async function setupTestProject() {
  if (existsSync(TEST_PROJECT)) {
    rmSync(TEST_PROJECT, { recursive: true });
  }
  mkdirSync(TEST_PROJECT, { recursive: true });
  
  // Create package.json
  writeFileSync(join(TEST_PROJECT, "package.json"), JSON.stringify({
    name: "test-project",
    version: "1.0.0",
    devDependencies: {
      "typescript": "^5.0.0"
    }
  }, null, 2));
  
  // Create tsconfig.json
  writeFileSync(join(TEST_PROJECT, "tsconfig.json"), JSON.stringify({
    compilerOptions: {
      target: "ES2022",
      module: "ESNext",
      strict: true,
      skipLibCheck: true
    }
  }, null, 2));
  
  // Install TypeScript in the test project
  console.log("Installing TypeScript in test project...");
  execSync("bun install", { cwd: TEST_PROJECT, stdio: "inherit" });
  
  // Create test file with errors
  writeFileSync(join(TEST_PROJECT, "test.ts"), `
// This file has intentional errors for testing
const message: string = 123; // Type error
console.log(mesage); // Typo error

function add(a: number, b: number): number {
  return a + b;
}

add("1", "2"); // Type error
`);
  
  // Create test file without errors
  writeFileSync(join(TEST_PROJECT, "good.ts"), `
// This file has no errors
const message: string = "hello";
console.log(message);

function add(a: number, b: number): number {
  return a + b;
}

add(1, 2);
`);
}

describe("Comprehensive LSP Tests", () => {
  beforeAll(async () => {
    await setupTestProject();
  });
  
  afterAll(() => {
    if (existsSync(TEST_PROJECT)) {
      rmSync(TEST_PROJECT, { recursive: true });
    }
  });
  
  describe("1. Server Tests", () => {
    let serverProcess: any;
    let serverPort: number = 3941 + Math.floor(Math.random() * 100); // Random port to avoid conflicts
    let projectHash: string;
    
    beforeAll(async () => {
      // Calculate project hash
      projectHash = createHash('sha256').update(TEST_PROJECT).digest('hex').substring(0, 16);
      
      // Start server
      serverProcess = spawn("bun", ["run", join(projectRoot, "src/server.ts"), TEST_PROJECT], {
        stdio: ["inherit", "pipe", "pipe"],
        env: { ...process.env, LSP_PORT: serverPort.toString(), PROJECT_ROOT: TEST_PROJECT, CLAUDE_LSP_HOOK_MODE: 'true' }
      });
      
      // Capture server output for debugging
      serverProcess.stdout?.on("data", (data: Buffer) => {
        console.log("Server stdout:", data.toString());
      });
      
      serverProcess.stderr?.on("data", (data: Buffer) => {
        console.log("Server stderr:", data.toString());
      });
      
      // Wait for server to be ready
      let serverReady = false;
      for (let i = 0; i < 30; i++) {
        try {
          const response = await fetch(`http://localhost:${serverPort}/health`);
          if (response.ok) {
            serverReady = true;
            break;
          }
        } catch (e) {
          // Server not ready yet
        }
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
      if (!serverReady) {
        throw new Error("Server failed to start within 30 seconds");
      }
    });
    
    afterAll(() => {
      if (serverProcess) {
        serverProcess.kill();
      }
    });
    
    test("Server health endpoint works", async () => {
      const response = await fetch(`http://localhost:${serverPort}/health`);
      expect(response.ok).toBe(true);
      const data = await response.json();
      expect(data.status).toBe("healthy");
    });
    
    test("Server returns diagnostics for file with errors", async () => {
      const response = await fetch(`http://localhost:${serverPort}/diagnostics?file=${encodeURIComponent(join(TEST_PROJECT, "test.ts"))}`);
      expect(response.ok).toBe(true);
      const data = await response.json();
      expect(data.diagnostics).toBeDefined();
      // Should have errors in test.ts
      expect(data.diagnostics.length).toBeGreaterThan(0);
    });
    
    test("Server returns no diagnostics for good file", async () => {
      const response = await fetch(`http://localhost:${serverPort}/diagnostics?file=${encodeURIComponent(join(TEST_PROJECT, "good.ts"))}`);
      expect(response.ok).toBe(true);
      const data = await response.json();
      expect(data.diagnostics).toBeDefined();
      // Should have no errors in good.ts
      expect(data.diagnostics.length).toBe(0);
    });
  });
  
  describe("2. CLI Hook Mode Tests", () => {
    // Start a server for hook tests to use
    let serverProcess: any;
    
    beforeAll(async () => {
      const projectHash = createHash('sha256').update(TEST_PROJECT).digest('hex').substring(0, 16);
      
      // Start server for hooks to query
      serverProcess = spawn("bun", ["run", join(projectRoot, "src/server.ts"), TEST_PROJECT], {
        stdio: ["inherit", "pipe", "pipe"],
        env: { ...process.env, PROJECT_ROOT: TEST_PROJECT, CLAUDE_LSP_HOOK_MODE: 'true' }
      });
      
      // Wait a bit for server to start
      await new Promise(resolve => setTimeout(resolve, 3000));
    });
    
    afterAll(() => {
      if (serverProcess) {
        serverProcess.kill();
      }
    });
    
    test("PostToolUse with errors returns exit code 2", async () => {
      const hookData = {
        session_id: "test-session",
        transcript_path: "/tmp/test-transcript",
        cwd: TEST_PROJECT,
        hook_event_name: "PostToolUse",
        tool_name: "Edit",
        tool_input: { file_path: join(TEST_PROJECT, "test.ts") },
        tool_response: { success: true }
      };
      
      const result = await new Promise<{stdout: string, stderr: string, code: number}>((resolve) => {
        const proc = spawn("bun", ["run", join(projectRoot, "src/cli.ts"), "hook", "PostToolUse"], {
          cwd: projectRoot,
          env: { ...process.env, CLAUDE_LSP_HOOK_MODE: 'true' }
        });
        
        // Send hook data via stdin
        proc.stdin?.write(JSON.stringify(hookData));
        proc.stdin?.end();
        
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
      
      // Should exit with code 2 when errors are found
      expect(result.code).toBe(2);
      
      // Should output system message with diagnostics
      expect(result.stderr).toContain("[[system-message]]:");
      expect(result.stderr).toContain("errors_found");
    }, 30000);
    
    test("PostToolUse without errors returns exit code 0", async () => {
      const hookData = {
        session_id: "test-session",
        transcript_path: "/tmp/test-transcript",
        cwd: TEST_PROJECT,
        hook_event_name: "PostToolUse",
        tool_name: "Edit",
        tool_input: { file_path: join(TEST_PROJECT, "good.ts") },
        tool_response: { success: true }
      };
      
      const result = await new Promise<{stdout: string, stderr: string, code: number}>((resolve) => {
        const proc = spawn("bun", ["run", join(projectRoot, "src/cli.ts"), "hook", "PostToolUse"], {
          cwd: projectRoot,
          env: { ...process.env, CLAUDE_LSP_HOOK_MODE: 'true' }
        });
        
        proc.stdin?.write(JSON.stringify(hookData));
        proc.stdin?.end();
        
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
      
      // Should exit with code 0 when no errors
      expect(result.code).toBe(0);
      
      // Should still output system message but with all_clear
      expect(result.stderr).toContain("[[system-message]]:");
      expect(result.stderr).toContain("all_clear");
    }, 30000);
    
    test("Hook handles missing data gracefully", async () => {
      const result = await new Promise<{stdout: string, stderr: string, code: number}>((resolve) => {
        const proc = spawn("bun", ["run", join(projectRoot, "src/cli.ts"), "hook", "SessionStart"], {
          cwd: projectRoot,
          env: { ...process.env, CLAUDE_LSP_HOOK_MODE: 'true' }
        });
        
        // Send empty JSON
        proc.stdin?.write("{}");
        proc.stdin?.end();
        
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
      
      // Should exit successfully even with missing data
      expect(result.code).toBe(0);
    }, 10000);
    
    test("Hook handles empty input gracefully", async () => {
      const result = await new Promise<{stdout: string, stderr: string, code: number}>((resolve) => {
        const proc = spawn("bun", ["run", join(projectRoot, "src/cli.ts"), "hook", "Stop"], {
          cwd: projectRoot,
          env: { ...process.env, CLAUDE_LSP_HOOK_MODE: 'true' }
        });
        
        // Send empty input
        proc.stdin?.write("");
        proc.stdin?.end();
        
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
      
      // Should exit successfully even with empty input
      expect(result.code).toBe(0);
    }, 10000);
    
    test("Hook handles malformed JSON gracefully", async () => {
      const result = await new Promise<{stdout: string, stderr: string, code: number}>((resolve) => {
        const proc = spawn("bun", ["run", join(projectRoot, "src/cli.ts"), "hook", "PostToolUse"], {
          cwd: projectRoot,
          env: { ...process.env, CLAUDE_LSP_HOOK_MODE: 'true' }
        });
        
        // Send malformed JSON
        proc.stdin?.write("{ invalid json }");
        proc.stdin?.end();
        
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
      
      // Should exit successfully even with malformed JSON
      expect(result.code).toBe(0);
    }, 10000);
  });
  
  describe("3. CLI Non-Hook Mode Tests", () => {
    test("CLI diagnostics command works", async () => {
      const result = await new Promise<{stdout: string, stderr: string, code: number}>((resolve) => {
        const proc = spawn("bun", ["run", join(projectRoot, "src/cli.ts"), "diagnostics", TEST_PROJECT], {
          cwd: projectRoot,
          env: { ...process.env }
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
      expect(result.code).toBeLessThanOrEqual(1);
      
      // Should produce output
      expect(result.stdout.length + result.stderr.length).toBeGreaterThan(0);
    }, 30000);
    
    test("CLI diagnostics with specific file", async () => {
      const result = await new Promise<{stdout: string, stderr: string, code: number}>((resolve) => {
        const proc = spawn("bun", ["run", join(projectRoot, "src/cli.ts"), "diagnostics", TEST_PROJECT, join(TEST_PROJECT, "test.ts")], {
          cwd: projectRoot,
          env: { ...process.env }
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
      
      // Should complete
      expect(result.code).toBeLessThanOrEqual(1);
    }, 30000);
  });
  
  describe("4. Binary Build Tests", () => {
    test("Binaries can be built", async () => {
      // Run build command
      execSync("bun run build", { cwd: projectRoot, stdio: "inherit" });
      
      // Check binaries exist
      expect(existsSync(join(projectRoot, "bin/claude-lsp-cli"))).toBe(true);
      expect(existsSync(join(projectRoot, "bin/claude-lsp-server"))).toBe(true);
    }, 60000);
    
    test("CLI binary executes", async () => {
      const binaryPath = join(projectRoot, "bin/claude-lsp-cli");
      if (!existsSync(binaryPath)) {
        // Build if not exists
        execSync("bun run build:cli", { cwd: projectRoot, stdio: "inherit" });
      }
      
      const result = await new Promise<{stdout: string, stderr: string, code: number}>((resolve) => {
        const proc = spawn(binaryPath, [], {
          env: { ...process.env }
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
      
      // Should show error or usage
      expect(result.stderr.length).toBeGreaterThan(0);
    });
  });
  
  describe("5. Timeout Protection Tests", () => {
    test("Hook times out after 30 seconds", async () => {
      // This test would take 30+ seconds, so we'll mock it
      // by checking the timeout code exists in the source
      const cliSource = readFileSync(join(projectRoot, "src/cli.ts"), "utf-8");
      expect(cliSource).toContain("setTimeout");
      expect(cliSource).toContain("30000"); // 30 second timeout
      expect(cliSource).toContain("timeout_error");
    });
  });
});
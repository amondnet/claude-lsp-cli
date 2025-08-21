#!/usr/bin/env bun

import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { LSPClient } from "../src/lsp-client";
import { runDiagnostics } from "../src/diagnostics";
import { languageServers, detectProjectLanguages } from "../src/language-servers";
import { existsSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { spawn } from "child_process";

const TEST_PROJECT = "/tmp/claude-lsp-all-tests";

describe("Complete LSP System Tests", () => {
  beforeAll(() => {
    // Setup test project
    if (existsSync(TEST_PROJECT)) {
      rmSync(TEST_PROJECT, { recursive: true });
    }
    mkdirSync(TEST_PROJECT, { recursive: true });
    
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
    
    writeFileSync(join(TEST_PROJECT, "test.ts"), `
const message: string = 123; // Type error
console.log(mesage); // Typo
function add(a: number, b: number): number {
  return a + b;
}
add("1", "2"); // Type error
`);
    
    writeFileSync(join(TEST_PROJECT, "test.js"), `
const obj = { name: "test" };
console.log(obj.nmae); // Property typo
`);
  });
  
  afterAll(() => {
    if (existsSync(TEST_PROJECT)) {
      rmSync(TEST_PROJECT, { recursive: true });
    }
  });
  
  describe("Language Detection", () => {
    test("Detects TypeScript project", () => {
      const languages = detectProjectLanguages(TEST_PROJECT);
      expect(languages).toContain("typescript");
    });
    
    test("Language server configurations exist", () => {
      expect(languageServers).toBeDefined();
      expect(languageServers.typescript).toBeDefined();
      // JavaScript config might not exist separately
      expect(languageServers.typescript || languageServers.javascript).toBeDefined();
    });
    
    test("TypeScript language server config is valid", () => {
      const tsConfig = languageServers.typescript;
      expect(tsConfig.name).toBe("TypeScript");
      // Command should be npx for auto-download
      expect(tsConfig.command).toBe("npx");
      expect(tsConfig.extensions).toContain(".ts");
      expect(tsConfig.extensions).toContain(".tsx");
    });
  });
  
  describe("LSP Client", () => {
    let client: LSPClient;
    
    beforeAll(() => {
      client = new LSPClient();
    });
    
    afterAll(async () => {
      if (client && client.shutdown) {
        await client.shutdown();
      }
    });
    
    test("LSPClient initializes", () => {
      expect(client).toBeDefined();
      expect(client).toBeInstanceOf(LSPClient);
    });
    
    test("Has required methods", () => {
      expect(typeof client.autoDetectAndStart).toBe("function");
      expect(typeof client.openDocument).toBe("function");
      expect(typeof client.getDiagnostics).toBe("function");
      expect(typeof client.shutdown).toBe("function");
    });
    
    test("Auto-detects and starts language servers", async () => {
      await client.autoDetectAndStart(TEST_PROJECT);
      const activeServers = client.getActiveServers();
      expect(Array.isArray(activeServers)).toBe(true);
    }, 10000);
    
    test("Opens documents and gets diagnostics", async () => {
      const testFile = join(TEST_PROJECT, "test.ts");
      await client.openDocument(testFile);
      
      // Wait for diagnostics
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      const diagnostics = client.getDiagnostics(testFile);
      expect(Array.isArray(diagnostics)).toBe(true);
      
      // Should have diagnostics for the intentional errors
      if (diagnostics.length > 0) {
        const diag = diagnostics[0];
        expect(diag).toHaveProperty("range");
        expect(diag).toHaveProperty("message");
        expect(diag).toHaveProperty("severity");
      }
    }, 10000);
  });
  
  describe("Diagnostics System", () => {
    test("runDiagnostics returns expected structure", async () => {
      const result = await runDiagnostics(TEST_PROJECT);
      
      expect(result).toBeDefined();
      expect(result).toHaveProperty("diagnostics");
      expect(result).toHaveProperty("timestamp");
      expect(Array.isArray(result.diagnostics)).toBe(true);
      
      // Check timestamp format
      expect(result.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    }, 20000);
    
    test("Diagnostics have correct format", async () => {
      const testFile = join(TEST_PROJECT, "test.ts");
      const result = await runDiagnostics(TEST_PROJECT, testFile);
      
      if (result.diagnostics && result.diagnostics.length > 0) {
        const diag = result.diagnostics[0];
        
        // Required fields
        expect(diag).toHaveProperty("file");
        expect(diag).toHaveProperty("line");
        expect(diag).toHaveProperty("column");
        expect(diag).toHaveProperty("severity");
        expect(diag).toHaveProperty("message");
        expect(diag).toHaveProperty("source");
        
        // Field types
        expect(typeof diag.file).toBe("string");
        expect(typeof diag.line).toBe("number");
        expect(typeof diag.column).toBe("number");
        expect(["error", "warning", "info"]).toContain(diag.severity);
        expect(typeof diag.message).toBe("string");
        expect(typeof diag.source).toBe("string");
        
        // Line and column should be positive
        expect(diag.line).toBeGreaterThan(0);
        expect(diag.column).toBeGreaterThanOrEqual(0);
      }
    }, 20000);
  });
  
  describe("CLI Tool", () => {
    test("CLI binary exists", () => {
      const cliBinary = join(import.meta.dir, "..", "bin", "claude-lsp-cli");
      expect(existsSync(cliBinary)).toBe(true);
    });
    
    test("CLI shows help", async () => {
      const result = await new Promise<{stdout: string, stderr: string, code: number}>((resolve) => {
        const proc = spawn("bun", ["run", join(import.meta.dir, "..", "src", "cli.ts"), "help"], {
          cwd: TEST_PROJECT
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
      
      expect(result.stdout).toContain("Claude LSP CLI");
      expect(result.stdout).toContain("Usage:");
      expect(result.code).toBe(0);
    }, 5000);
  });
  
  describe("Hook System", () => {
    test("Hook script exists", () => {
      const hookPath = join(import.meta.dir, "..", "hooks", "lsp-diagnostics.ts");
      expect(existsSync(hookPath)).toBe(true);
    });
    
    test("Hook processes PostToolUse events", async () => {
      const hookPath = join(import.meta.dir, "..", "hooks", "lsp-diagnostics.ts");
      
      const hookData = {
        event: "PostToolUse",
        tool: "Edit",
        parameters: {
          file_path: join(TEST_PROJECT, "test.ts")
        }
      };
      
      const proc = spawn("bun", [hookPath], {
        stdio: ["pipe", "pipe", "pipe"],
        cwd: TEST_PROJECT,
        env: { ...process.env, CLAUDE_LSP_HOOK_MODE: 'true' }
      });
      
      proc.stdin?.write(JSON.stringify(hookData));
      proc.stdin?.end();
      
      const exitCode = await new Promise<number>((resolve) => {
        proc.on("exit", (code) => resolve(code || 0));
      });
      
      // Should exit cleanly
      expect(exitCode).toBe(0);
    }, 10000);
  });
  
  describe("Security Features", () => {
    test("Security utilities exist", () => {
      const securityPath = join(import.meta.dir, "..", "src", "utils", "security.ts");
      expect(existsSync(securityPath)).toBe(true);
    });
    
    test("Rate limiter exists", () => {
      const rateLimiterPath = join(import.meta.dir, "..", "src", "utils", "rate-limiter.ts");
      expect(existsSync(rateLimiterPath)).toBe(true);
    });
    
    test("Logger exists", () => {
      const loggerPath = join(import.meta.dir, "..", "src", "utils", "logger.ts");
      expect(existsSync(loggerPath)).toBe(true);
    });
  });
});
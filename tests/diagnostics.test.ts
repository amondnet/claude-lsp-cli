#!/usr/bin/env bun

import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { runDiagnostics, handleHookEvent } from "../src/diagnostics";
import { existsSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { spawn } from "child_process";

const TEST_PROJECT = "/tmp/claude-lsp-diagnostics-test";

describe("Diagnostics System", () => {
  beforeAll(() => {
    // Setup test project
    if (existsSync(TEST_PROJECT)) {
      rmSync(TEST_PROJECT, { recursive: true });
    }
    mkdirSync(TEST_PROJECT, { recursive: true });
    
    // Create project files
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
const value: string = 123; // Type error
function greet(name: string) {
  console.log(naem); // Typo
}
greet(456); // Wrong argument type
`);
  });
  
  afterAll(() => {
    if (existsSync(TEST_PROJECT)) {
      rmSync(TEST_PROJECT, { recursive: true });
    }
  });
  
  test("runDiagnostics returns diagnostic data", async () => {
    const result = await runDiagnostics(TEST_PROJECT);
    
    expect(result).toHaveProperty("diagnostics");
    expect(result).toHaveProperty("timestamp");
    expect(Array.isArray(result.diagnostics)).toBe(true);
  }, 15000);
  
  test("runDiagnostics with specific file", async () => {
    const testFile = join(TEST_PROJECT, "test.ts");
    const result = await runDiagnostics(TEST_PROJECT, testFile);
    
    expect(result).toHaveProperty("diagnostics");
    expect(result).toHaveProperty("timestamp");
    
    // All diagnostics should be for the specified file
    if (result.diagnostics.length > 0) {
      result.diagnostics.forEach((d: any) => {
        expect(d.file).toBe(testFile);
      });
    }
  }, 15000);
  
  test("Diagnostics format is correct", async () => {
    const result = await runDiagnostics(TEST_PROJECT);
    
    if (result.diagnostics && result.diagnostics.length > 0) {
      const diagnostic = result.diagnostics[0];
      
      // Check diagnostic structure
      expect(diagnostic).toHaveProperty("file");
      expect(diagnostic).toHaveProperty("line");
      expect(diagnostic).toHaveProperty("column");
      expect(diagnostic).toHaveProperty("severity");
      expect(diagnostic).toHaveProperty("message");
      expect(diagnostic).toHaveProperty("source");
      
      // Check severity values
      expect(["error", "warning", "info"]).toContain(diagnostic.severity);
      
      // Check line/column are numbers
      expect(typeof diagnostic.line).toBe("number");
      expect(typeof diagnostic.column).toBe("number");
      expect(diagnostic.line).toBeGreaterThan(0);
      expect(diagnostic.column).toBeGreaterThanOrEqual(0);
    }
  }, 15000);
});

describe("Hook Event Handling", () => {
  beforeAll(() => {
    process.env.CLAUDE_LSP_HOOK_MODE = 'true'; // Suppress logging
    
    if (!existsSync(TEST_PROJECT)) {
      mkdirSync(TEST_PROJECT, { recursive: true });
    }
    
    writeFileSync(join(TEST_PROJECT, "hook-test.ts"), `
const test = "hello";
`);
  });
  
  afterAll(() => {
    delete process.env.CLAUDE_LSP_HOOK_MODE;
  });
  
  test("handleHookEvent processes PostToolUse", async () => {
    const hookData = {
      eventType: "PostToolUse",
      tool: "Edit",
      parameters: {
        file_path: join(TEST_PROJECT, "hook-test.ts"),
        old_string: 'const test = "hello";',
        new_string: 'const test: string = "hello";'
      },
      result: "Edit applied",
      workingDirectory: TEST_PROJECT
    };
    
    // Mock stdin
    const originalStdin = Bun.stdin;
    // @ts-ignore
    Bun.stdin = {
      text: async () => JSON.stringify(hookData)
    };
    
    let outputCaptured = "";
    const originalLog = console.log;
    const originalError = console.error;
    
    console.log = (msg: string) => { outputCaptured += msg; };
    console.error = (msg: string) => { outputCaptured += msg; };
    
    try {
      await handleHookEvent("PostToolUse");
      
      // Should not output anything if no errors
      // or should output [[system-message]] if there are diagnostics
      if (outputCaptured) {
        expect(outputCaptured.includes("[[system-message]]") || 
               outputCaptured.length === 0).toBe(true);
      }
    } finally {
      // @ts-ignore
      Bun.stdin = originalStdin;
      console.log = originalLog;
      console.error = originalError;
    }
  });
  
  test("handleHookEvent processes SessionStart", async () => {
    const hookData = {
      eventType: "SessionStart",
      workingDirectory: TEST_PROJECT
    };
    
    // Mock stdin
    const originalStdin = Bun.stdin;
    // @ts-ignore
    Bun.stdin = {
      text: async () => JSON.stringify(hookData)
    };
    
    let outputCaptured = "";
    const originalError = console.error;
    console.error = (msg: string) => { outputCaptured += msg; };
    
    try {
      await handleHookEvent("SessionStart");
      
      // Should only output if there are initial errors
      if (outputCaptured && outputCaptured.includes("[[system-message]]")) {
        const message = outputCaptured.split("[[system-message]]:")[1];
        const parsed = JSON.parse(message);
        expect(parsed.result).toBe("initial_errors_found");
      }
    } finally {
      // @ts-ignore
      Bun.stdin = originalStdin;
      console.error = originalError;
    }
  });
  
  test("handleHookEvent ignores non-edit tools", async () => {
    const hookData = {
      eventType: "PostToolUse",
      tool: "Bash", // Not an edit tool
      parameters: { command: "ls" },
      result: "file1.txt file2.txt"
    };
    
    // Mock stdin
    const originalStdin = Bun.stdin;
    // @ts-ignore
    Bun.stdin = {
      text: async () => JSON.stringify(hookData)
    };
    
    let outputCaptured = "";
    const originalLog = console.log;
    const originalError = console.error;
    
    console.log = (msg: string) => { outputCaptured += msg; };
    console.error = (msg: string) => { outputCaptured += msg; };
    
    try {
      await handleHookEvent("PostToolUse");
      
      // Should not output anything for non-edit tools
      expect(outputCaptured).toBe("");
    } finally {
      // @ts-ignore
      Bun.stdin = originalStdin;
      console.log = originalLog;
      console.error = originalError;
    }
  });
  
  test("handleHookEvent handles Stop event", async () => {
    const hookData = {
      eventType: "Stop",
      workingDirectory: TEST_PROJECT
    };
    
    // Mock stdin
    const originalStdin = Bun.stdin;
    // @ts-ignore
    Bun.stdin = {
      text: async () => JSON.stringify(hookData)
    };
    
    try {
      // Should not throw
      await expect(handleHookEvent("Stop")).resolves.not.toThrow();
    } finally {
      // @ts-ignore
      Bun.stdin = originalStdin;
    }
  });
});

describe("Hook Integration", () => {
  test("Hook binary exists", () => {
    const hookPath = join(import.meta.dir, "..", "hooks", "lsp-diagnostics.ts");
    expect(existsSync(hookPath)).toBe(true);
  });
  
  test("Hook processes real Claude Code data", async () => {
    const hookPath = join(import.meta.dir, "..", "hooks", "lsp-diagnostics.ts");
    
    if (!existsSync(hookPath)) {
      console.log("Hook not found, skipping");
      return;
    }
    
    // Create Claude Code-like hook data
    const claudeData = {
      event: "PostToolUse",
      tool: "Edit",
      parameters: {
        file_path: join(TEST_PROJECT, "test.ts"),
        old_string: "const value: string = 123;",
        new_string: "const value: number = 123;"
      },
      result: {
        success: true,
        message: "Edit applied successfully"
      },
      metadata: {
        timestamp: new Date().toISOString(),
        sessionId: "test-session"
      }
    };
    
    // Run hook as subprocess
    const hookProcess = spawn("bun", [hookPath], {
      stdio: ["pipe", "pipe", "pipe"],
      cwd: TEST_PROJECT
    });
    
    hookProcess.stdin?.write(JSON.stringify(claudeData));
    hookProcess.stdin?.end();
    
    const exitCode = await new Promise<number>((resolve) => {
      hookProcess.on("exit", (code) => resolve(code || 0));
    });
    
    // Should exit cleanly
    expect(exitCode).toBe(0);
  }, 10000);
});
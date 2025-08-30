import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { spawn } from "child_process";
import { promisify } from "util";
import { join } from "path";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "fs";
import { tmpdir } from "os";

const exec = promisify(require("child_process").exec);

describe("Diagnostics Command", () => {
  const CLI_PATH = join(__dirname, "..", "bin", "claude-lsp-cli");
  let testProject: string;
  
  beforeAll(() => {
    // Create a temporary test project with TypeScript errors
    testProject = mkdtempSync(join(tmpdir(), "diag-test-"));
    mkdirSync(join(testProject, "src"), { recursive: true });
    
    // Create tsconfig.json
    writeFileSync(join(testProject, "tsconfig.json"), JSON.stringify({
      compilerOptions: {
        target: "ES2020",
        module: "commonjs",
        strict: true,
        esModuleInterop: true,
        skipLibCheck: true,
        forceConsistentCasingInFileNames: true
      }
    }, null, 2));
    
    // Create a TypeScript file with intentional errors
    writeFileSync(join(testProject, "src", "index.ts"), `
      // Intentional TypeScript errors for testing
      const greeting: string = 123; // Type error: number to string
      const count: number = "hello"; // Type error: string to number
      
      function test(): string {
        return 42; // Type error: returning number instead of string
      }
      
      // Undefined variable
      console.log(undefinedVariable);
      
      // Wrong type assignment
      const arr: string[] = [1, 2, 3]; // Type error: numbers to string array
      
      // Function with missing return
      function missingReturn(): number {
        // Missing return statement
      }
      
      // Type mismatch in function call
      function expectsString(val: string) {
        console.log(val);
      }
      expectsString(123); // Type error: passing number to string param
    `);
    
    // Create another file with errors
    writeFileSync(join(testProject, "src", "utils.ts"), `
      export function add(a: number, b: number): number {
        return a + b + "c"; // Type error: string concatenation in number return
      }
      
      export const config: { port: number } = {
        port: "3000" // Type error: string to number
      };
    `);
  });
  
  afterAll(async () => {
    // Clean up: stop any servers for the test project
    try {
      await exec(`${CLI_PATH} stop ${testProject}`);
    } catch {
      // Ignore errors if server wasn't running
    }
    
    // Remove test directory
    rmSync(testProject, { recursive: true, force: true });
  });
  
  test("diagnostics command returns errors for TypeScript project", async () => {
    // First start the server
    const { stdout: startOut } = await exec(`${CLI_PATH} start ${testProject}`);
    expect(startOut).toContain("LSP server started");
    
    // Wait for server to initialize and detect TypeScript
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Run diagnostics command
    const { stdout } = await exec(`${CLI_PATH} diagnostics ${testProject}`);
    
    const result = JSON.parse(stdout);
    
    // Check basic structure
    expect(result).toHaveProperty("diagnostics");
    expect(result).toHaveProperty("summary");
    expect(result).toHaveProperty("total_count");
    expect(result).toHaveProperty("by_source");
    expect(result).toHaveProperty("timestamp");
    
    // Should have found errors
    expect(result.total_count).toBeGreaterThan(0);
    expect(result.diagnostics.length).toBeGreaterThan(0);
    
    // Check that we have TypeScript errors
    expect(result.summary).not.toBe("no warnings or errors");
    
    // Verify diagnostics have expected structure
    if (result.diagnostics.length > 0) {
      const firstDiag = result.diagnostics[0];
      expect(firstDiag).toHaveProperty("file");
      expect(firstDiag).toHaveProperty("line");
      expect(firstDiag).toHaveProperty("column");
      expect(firstDiag).toHaveProperty("severity");
      expect(firstDiag).toHaveProperty("message");
      expect(firstDiag).toHaveProperty("source");
      
      // Should be error or warning
      expect(["error", "warning"]).toContain(firstDiag.severity);
    }
  }, 20000); // 20 second timeout for this test
  
  test("diagnostics command with file argument", async () => {
    const filePath = join(testProject, "src", "index.ts");
    
    // Ensure server is running
    await exec(`${CLI_PATH} start ${testProject}`);
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Run diagnostics for specific file
    const { stdout } = await exec(`${CLI_PATH} diagnostics ${filePath}`);
    
    const result = JSON.parse(stdout);
    
    // Should return project-level diagnostics (since we don't support file-specific)
    expect(result).toHaveProperty("diagnostics");
    expect(result).toHaveProperty("summary");
  }, 15000);
  
  test("diagnostics command starts server if not running", async () => {
    // Stop any existing server
    await exec(`${CLI_PATH} stop ${testProject}`).catch(() => {});
    
    // Wait to ensure server is stopped
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Run diagnostics - should auto-start server
    const { stdout } = await exec(`${CLI_PATH} diagnostics ${testProject}`);
    
    const result = JSON.parse(stdout);
    
    // Even if server wasn't running, should get results
    expect(result).toHaveProperty("diagnostics");
    expect(result).toHaveProperty("summary");
    
    // Verify server is now running
    const { stdout: statusOut } = await exec(`${CLI_PATH} status ${testProject}`);
    expect(statusOut).toContain(testProject);
  }, 25000); // Longer timeout since it needs to start server
  
  test("diagnostics command handles project with no errors", async () => {
    // Create a clean project
    const cleanProject = mkdtempSync(join(tmpdir(), "clean-test-"));
    mkdirSync(join(cleanProject, "src"), { recursive: true });
    
    writeFileSync(join(cleanProject, "tsconfig.json"), JSON.stringify({
      compilerOptions: {
        target: "ES2020",
        module: "commonjs"
      }
    }, null, 2));
    
    // Create error-free TypeScript file
    writeFileSync(join(cleanProject, "src", "clean.ts"), `
      const greeting: string = "Hello World";
      const count: number = 42;
      
      function test(): string {
        return "test";
      }
      
      console.log(greeting, count);
    `);
    
    try {
      // Start server and run diagnostics
      await exec(`${CLI_PATH} start ${cleanProject}`);
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      const { stdout } = await exec(`${CLI_PATH} diagnostics ${cleanProject}`);
      const result = JSON.parse(stdout);
      
      // Should have no errors
      expect(result.summary).toBe("no warnings or errors");
      expect(result.total_count).toBe(0);
      expect(result.diagnostics).toEqual([]);
      
    } finally {
      // Clean up
      await exec(`${CLI_PATH} stop ${cleanProject}`).catch(() => {});
      rmSync(cleanProject, { recursive: true, force: true });
    }
  }, 20000);
  
  test("diagnostics returns proper error format", async () => {
    // Invalid project path
    const { stdout, stderr } = await exec(`${CLI_PATH} diagnostics /nonexistent/path 2>&1 || true`);
    
    // Should handle gracefully
    if (stdout) {
      try {
        const result = JSON.parse(stdout);
        // Even for non-existent project, should return valid JSON structure
        expect(result).toHaveProperty("diagnostics");
      } catch {
        // If not JSON, that's ok too - might be an error message
        expect(stdout.toLowerCase()).toMatch(/error|not found|failed/);
      }
    }
  });
});
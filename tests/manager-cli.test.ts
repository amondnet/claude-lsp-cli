import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";
import { spawn } from "bun";
import { join } from "path";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "fs";
import { tmpdir } from "os";

describe("Manager CLI", () => {
  let testDir: string;
  const cliPath = join(import.meta.dir, "../src/manager-cli.ts");

  beforeEach(() => {
    // Create test directory
    testDir = mkdtempSync(join(tmpdir(), "manager-cli-test-"));
    mkdirSync(join(testDir, "src"), { recursive: true });
    mkdirSync(join(testDir, ".git"));
    
    // Create test files
    writeFileSync(join(testDir, "package.json"), JSON.stringify({
      name: "test-project"
    }));
    writeFileSync(join(testDir, "src", "test.ts"), `
      const x = 1;
      console.log(x);
    `);
  });

  afterEach(async () => {
    // Stop any running servers
    const stopProc = spawn(["bun", cliPath, "stop", testDir], {
      stdout: "pipe",
      stderr: "pipe"
    });
    await stopProc.exited;
    
    // Cleanup test directory
    if (testDir) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  test("should show help when no command provided", async () => {
    const proc = spawn(["bun", cliPath], {
      stdout: "pipe",
      stderr: "pipe"
    });
    
    const output = await new Response(proc.stdout).text();
    await proc.exited;
    
    expect(output).toContain("Real LSP Manager");
    expect(output).toContain("Usage:");
    expect(output).toContain("Commands:");
    expect(output).toContain("start");
    expect(output).toContain("auto");
    expect(output).toContain("check");
    expect(output).toContain("diagnostics");
    expect(output).toContain("stop");
  });

  test("should handle 'start' command", async () => {
    const proc = spawn(["bun", cliPath, "start", testDir], {
      stdout: "pipe",
      stderr: "pipe"
    });
    
    const output = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;
    
    expect(exitCode).toBe(0);
    // Should complete without errors (output may vary based on environment)
    expect(output).toBeDefined();
  });

  test("should handle 'check' command", async () => {
    const proc = spawn(["bun", cliPath, "check", testDir], {
      stdout: "pipe",
      stderr: "pipe"
    });
    
    const output = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;
    
    expect(exitCode).toBe(0);
    expect(output).toMatch(/LSP server for .+: (RUNNING|NOT RUNNING)/);
  });

  test("should handle 'auto' command", async () => {
    const testFile = join(testDir, "src", "test.ts");
    const proc = spawn(["bun", cliPath, "auto", testFile], {
      stdout: "pipe",
      stderr: "pipe"
    });
    
    const output = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;
    
    expect(exitCode).toBe(0);
    // Should complete without errors
    expect(output).toBeDefined();
  });

  test("should handle 'diagnostics' command", async () => {
    const proc = spawn(["bun", cliPath, "diagnostics", testDir], {
      stdout: "pipe",
      stderr: "pipe"
    });
    
    const output = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;
    
    expect(exitCode).toBe(0);
    // Should return JSON (null or object)
    expect(() => JSON.parse(output)).not.toThrow();
  });

  test("should handle 'diagnostics' command with file parameter", async () => {
    const testFile = join(testDir, "src", "test.ts");
    const proc = spawn(["bun", cliPath, "diagnostics", testDir, testFile], {
      stdout: "pipe",
      stderr: "pipe"
    });
    
    const output = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;
    
    expect(exitCode).toBe(0);
    // Should return JSON (null or object)
    expect(() => JSON.parse(output)).not.toThrow();
  });

  test("should handle 'stop' command", async () => {
    const proc = spawn(["bun", cliPath, "stop", testDir], {
      stdout: "pipe",
      stderr: "pipe"
    });
    
    const output = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;
    
    expect(exitCode).toBe(0);
    // Should complete without errors
    expect(output).toBeDefined();
  });

  test("should handle invalid command", async () => {
    const proc = spawn(["bun", cliPath, "invalid-command"], {
      stdout: "pipe",
      stderr: "pipe"
    });
    
    const output = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;
    
    expect(exitCode).toBe(0);
    expect(output).toContain("Real LSP Manager");
    expect(output).toContain("Usage:");
  });

  test("should handle non-existent path", async () => {
    const proc = spawn(["bun", cliPath, "check", "/non/existent/path"], {
      stdout: "pipe",
      stderr: "pipe"
    });
    
    const output = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;
    
    expect(exitCode).toBe(0);
    // Should either find a parent project or report no project
    expect(output).toMatch(/LSP server for .+: (RUNNING|NOT RUNNING)|No project found/);
  });

  test("should use current directory when no path provided", async () => {
    const origCwd = process.cwd();
    process.chdir(testDir);
    
    try {
      const proc = spawn(["bun", cliPath, "check"], {
        stdout: "pipe",
        stderr: "pipe",
        cwd: testDir
      });
      
      const output = await new Response(proc.stdout).text();
      const exitCode = await proc.exited;
      
      expect(exitCode).toBe(0);
      expect(output).toContain("LSP server");
    } finally {
      process.chdir(origCwd);
    }
  });
});
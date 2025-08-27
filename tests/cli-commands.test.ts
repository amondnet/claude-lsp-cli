import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { spawn } from "child_process";
import { promisify } from "util";
import { join } from "path";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "fs";
import { tmpdir } from "os";

const exec = promisify(require("child_process").exec);

describe("CLI Commands", () => {
  const CLI_PATH = join(__dirname, "..", "bin", "claude-lsp-cli");
  let testProject: string;
  
  beforeAll(() => {
    // Create a temporary test project
    testProject = mkdtempSync(join(tmpdir(), "cli-test-"));
    mkdirSync(join(testProject, "src"), { recursive: true });
    
    // Create a simple TypeScript file
    writeFileSync(join(testProject, "tsconfig.json"), JSON.stringify({
      compilerOptions: {
        target: "ES2020",
        module: "commonjs",
        strict: true
      }
    }, null, 2));
    
    writeFileSync(join(testProject, "src", "index.ts"), `
      const greeting: string = "Hello World";
      console.log(greeting);
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
  
  test("status command shows proper format", async () => {
    const { stdout } = await exec(`${CLI_PATH} status`);
    
    // Check for expected output format
    if (stdout.includes("No LSP servers running")) {
      expect(stdout).toContain("No LSP servers running");
    } else {
      expect(stdout).toContain("Running LSP servers:");
      expect(stdout).toContain("Hash:");
      expect(stdout).toContain("Project:");
      expect(stdout).toContain("Languages:");
      expect(stdout).toContain("PID:");
      expect(stdout).toContain("Status:");
      expect(stdout).toContain("Socket:");
    }
  });
  
  test("start command starts server for project", async () => {
    const { stdout } = await exec(`${CLI_PATH} start ${testProject}`);
    
    expect(stdout).toContain("LSP server started");
    expect(stdout).toMatch(/PID: \d+/);
    
    // Wait a bit for server to initialize and register
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Verify it's in the status
    const { stdout: statusOut } = await exec(`${CLI_PATH} status ${testProject}`);
    expect(statusOut).toContain(testProject);
    expect(statusOut).toContain("typescript");
  }, 15000);
  
  test("stop command stops server for project", async () => {
    // First ensure a server is running
    await exec(`${CLI_PATH} start ${testProject}`);
    
    // Wait for server to register
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Now stop it
    const { stdout } = await exec(`${CLI_PATH} stop ${testProject}`);
    
    expect(stdout).toContain("Stopping LSP server");
    // Should show either graceful shutdown or process not found
    expect(stdout).toMatch(/Server shutdown gracefully|Process not found/);
    
    // Verify it's not in the status anymore
    const { stdout: statusOut } = await exec(`${CLI_PATH} status ${testProject}`);
    expect(statusOut).toMatch(/No LSP server running|No LSP servers running/);
  }, 15000);
  
  test("stop-all command stops all servers", async () => {
    // Start a couple of servers
    const testProject2 = mkdtempSync(join(tmpdir(), "cli-test2-"));
    mkdirSync(join(testProject2, "src"), { recursive: true });
    writeFileSync(join(testProject2, "package.json"), JSON.stringify({
      name: "test2",
      version: "1.0.0"
    }));
    
    try {
      await exec(`${CLI_PATH} start ${testProject}`);
      await exec(`${CLI_PATH} start ${testProject2}`);
      
      // Wait for servers to register
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // Stop all
      const { stdout } = await exec(`${CLI_PATH} stop-all`);
      
      expect(stdout).toContain("Stopping all LSP servers");
      // Check for either summary or no servers message
      expect(stdout).toMatch(/Summary:|No LSP servers are running/);
      
      // Verify none are running
      const { stdout: statusOut } = await exec(`${CLI_PATH} status`);
      expect(statusOut).toMatch(/No LSP servers running|Total: 0 server/);
    } finally {
      rmSync(testProject2, { recursive: true, force: true });
    }
  }, 20000);
  
  test("kill-all is aliased to stop-all", async () => {
    // The kill-all command should work for backward compatibility
    const { stdout } = await exec(`${CLI_PATH} kill-all`);
    
    expect(stdout).toMatch(/Stopping all LSP servers|No LSP servers running/);
  });
  
  test("help command shows updated commands", async () => {
    const { stdout } = await exec(`${CLI_PATH} help`);
    
    expect(stdout).toContain("claude-lsp-cli stop <project>");
    expect(stdout).toContain("Stop LSP server for project");
    expect(stdout).toContain("claude-lsp-cli stop-all");
    expect(stdout).toContain("Stop all running LSP servers");
  });
  
  test("version command returns version", async () => {
    const { stdout } = await exec(`${CLI_PATH} --version`);
    
    expect(stdout).toMatch(/\d+\.\d+\.\d+/); // Semantic version format
  });
});
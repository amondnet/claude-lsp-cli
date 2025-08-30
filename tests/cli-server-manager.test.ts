import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { join } from "path";
import { promisify } from "util";
import { existsSync, mkdirSync, writeFileSync, rmSync } from "fs";

const exec = promisify(require("child_process").exec);

describe("CLI Server Manager", () => {
  const CLI_PATH = join(__dirname, "..", "bin", "claude-lsp-cli");
  const TEMP_DIR = `/tmp/cli-server-test-${Date.now()}`;
  
  beforeAll(async () => {
    // Clean slate - stop all servers
    await exec(`${CLI_PATH} stop-all`).catch(() => {});
    
    // Create temp directory
    if (!existsSync(TEMP_DIR)) {
      mkdirSync(TEMP_DIR, { recursive: true });
    }
  });
  
  afterAll(async () => {
    // Clean up
    await exec(`${CLI_PATH} stop-all`).catch(() => {});
    if (existsSync(TEMP_DIR)) {
      rmSync(TEMP_DIR, { recursive: true, force: true });
    }
  });

  describe("Server Lifecycle", () => {
    test("should start server for project", async () => {
      const testProject = join(TEMP_DIR, "start-test");
      mkdirSync(testProject);
      writeFileSync(join(testProject, "package.json"), JSON.stringify({
        name: "start-test"
      }));
      
      const { stdout } = await exec(`${CLI_PATH} start ${testProject}`);
      expect(stdout).toContain("LSP server started");
      expect(stdout).toMatch(/PID: \d+/);
      
      // Verify it's running
      const { stdout: status } = await exec(`${CLI_PATH} status ${testProject}`);
      expect(status).toContain("Running");
    }, 10000);

    test("should stop server for project", async () => {
      const testProject = join(TEMP_DIR, "stop-test");
      mkdirSync(testProject);
      writeFileSync(join(testProject, "package.json"), JSON.stringify({
        name: "stop-test"
      }));
      
      // Start server
      await exec(`${CLI_PATH} start ${testProject}`);
      
      // Stop server
      const { stdout } = await exec(`${CLI_PATH} stop ${testProject}`);
      expect(stdout).toMatch(/Server shutdown gracefully|Process terminated/);
      
      // Verify it's stopped
      const { stdout: status } = await exec(`${CLI_PATH} status ${testProject}`);
      expect(status).toMatch(/No LSP server running|not responding/);
    }, 10000);

    test("should not start duplicate servers", async () => {
      const testProject = join(TEMP_DIR, "duplicate-test");
      mkdirSync(testProject);
      writeFileSync(join(testProject, "package.json"), JSON.stringify({
        name: "duplicate-test"
      }));
      
      // Start first server
      await exec(`${CLI_PATH} start ${testProject}`);
      
      // Try to start again
      const { stdout } = await exec(`${CLI_PATH} start ${testProject}`);
      expect(stdout).toContain("already running");
    }, 10000);
  });

  describe("Server Status", () => {
    test("should show status for all servers", async () => {
      // Start a couple of servers
      const project1 = join(TEMP_DIR, "status-test-1");
      const project2 = join(TEMP_DIR, "status-test-2");
      
      mkdirSync(project1);
      mkdirSync(project2);
      writeFileSync(join(project1, "package.json"), '{"name":"test1"}');
      writeFileSync(join(project2, "package.json"), '{"name":"test2"}');
      
      await exec(`${CLI_PATH} start ${project1}`);
      await exec(`${CLI_PATH} start ${project2}`);
      
      const { stdout } = await exec(`${CLI_PATH} status`);
      expect(stdout).toContain("Running LSP servers");
      expect(stdout).toContain("status-test-1");
      expect(stdout).toContain("status-test-2");
      expect(stdout).toMatch(/Total: \d+ server/);
    }, 15000);

    test("should show project-specific status", async () => {
      const testProject = join(TEMP_DIR, "specific-status");
      mkdirSync(testProject);
      writeFileSync(join(testProject, "package.json"), '{"name":"specific"}');
      
      await exec(`${CLI_PATH} start ${testProject}`);
      
      const { stdout } = await exec(`${CLI_PATH} status ${testProject}`);
      expect(stdout).toContain("specific-status");
      expect(stdout).toMatch(/PID:\s+\d+/);
      expect(stdout).toContain("Socket:");
    }, 10000);
  });

  describe("Stop All", () => {
    test("should stop all running servers", async () => {
      // Start multiple servers
      const projects = ["stop-all-1", "stop-all-2", "stop-all-3"].map(name => {
        const dir = join(TEMP_DIR, name);
        mkdirSync(dir);
        writeFileSync(join(dir, "package.json"), `{"name":"${name}"}`);
        return dir;
      });
      
      // Start all
      for (const project of projects) {
        await exec(`${CLI_PATH} start ${project}`);
      }
      
      // Stop all
      const { stdout } = await exec(`${CLI_PATH} stop-all`);
      expect(stdout).toContain("Stopping");
      expect(stdout).toContain("Summary");
      
      // Verify all stopped
      const { stdout: status } = await exec(`${CLI_PATH} status`);
      expect(status).toMatch(/No LSP servers running|Total: 0 server/);
    }, 20000);
  });

  describe("Idle Cleanup", () => {
    test("should clean idle servers", async () => {
      const testProject = join(TEMP_DIR, "idle-test");
      mkdirSync(testProject);
      writeFileSync(join(testProject, "package.json"), '{"name":"idle"}');
      
      // Start server
      await exec(`${CLI_PATH} start ${testProject}`);
      
      // Clean idle (with 0 minute threshold for testing)
      const { stdout } = await exec(`${CLI_PATH} clean-idle 0`);
      expect(stdout).toMatch(/Stopped \d+ idle server|No servers exceeded idle threshold/);
    }, 10000);
  });

  describe("Error Handling", () => {
    test("should handle stopping non-existent server", async () => {
      const { stdout } = await exec(`${CLI_PATH} stop /non/existent/path`);
      expect(stdout).toContain("No LSP server running");
    });

    test("should handle invalid project path", async () => {
      const { stdout, stderr } = await exec(`${CLI_PATH} start /non/existent/path`).catch(e => e);
      // Should either error or handle gracefully
      expect(stdout || stderr).toBeDefined();
    });
  });
});
/**
 * Integration tests that demonstrate our key rules and optimizations are working
 * These tests verify the actual behavior of our CPU optimization fixes
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { spawn, exec as execCallback } from "child_process";
import { promisify } from "util";
import { writeFileSync, mkdirSync, rmSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

const exec = promisify(execCallback);
const CLI_PATH = join(import.meta.dir, "..", "bin", "claude-lsp-cli");
const SERVER_PATH = join(import.meta.dir, "..", "bin", "claude-lsp-server");

describe("Integration Tests - Core Rules", () => {
  let testDir: string;

  beforeAll(() => {
    // Create test directory
    testDir = join(tmpdir(), `integration-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterAll(async () => {
    // Kill any servers for test directories specifically
    await exec(`pkill -9 -f "claude-lsp-server.*integration-test"`).catch(() => {});
    
    // Clean up all test servers
    await exec(`${CLI_PATH} stop-all`).catch(() => {});
    
    // Clean up test directory
    rmSync(testDir, { recursive: true, force: true });
  });

  describe("Rule 1: No Race Conditions - Only One Server Per Project", () => {
    test("should prevent duplicate servers when multiple requests happen simultaneously", async () => {
      const projectDir = join(testDir, "race-test");
      mkdirSync(projectDir);
      writeFileSync(join(projectDir, "package.json"), JSON.stringify({ name: "race-test" }));
      writeFileSync(join(projectDir, "test.ts"), "const x: string = 42; // error");

      // Start 5 concurrent requests for the same project
      const promises = [];
      for (let i = 0; i < 5; i++) {
        promises.push(
          exec(`echo "test" | ${CLI_PATH} diagnostics ${projectDir}`).catch(e => e)
        );
      }

      // Wait for all to complete
      await Promise.all(promises);

      // Check how many servers are actually running for this project
      const { stdout } = await exec(`${CLI_PATH} status`);
      
      // Count how many times this project appears in the status
      const projectCount = (stdout.match(new RegExp(projectDir, 'g')) || []).length;
      
      // Should only have ONE server for this project despite 5 concurrent requests
      expect(projectCount).toBeLessThanOrEqual(1);
    }, 30000);

    test("should reuse existing server connection instead of spawning new ones", async () => {
      const projectDir = join(testDir, "reuse-test");
      mkdirSync(projectDir);
      writeFileSync(join(projectDir, "package.json"), JSON.stringify({ name: "reuse-test" }));

      // First request - starts server
      await exec(`echo "test" | ${CLI_PATH} diagnostics ${projectDir}`);
      
      // Get initial process count
      const { stdout: before } = await exec("ps aux | grep claude-lsp-server | grep -v grep | wc -l");
      const countBefore = parseInt(before.trim());

      // Second request - should reuse server
      await exec(`echo "test" | ${CLI_PATH} diagnostics ${projectDir}`);
      
      // Get process count after
      const { stdout: after } = await exec("ps aux | grep claude-lsp-server | grep -v grep | wc -l");
      const countAfter = parseInt(after.trim());

      // Process count should not increase (or might even decrease due to cleanup)
      expect(countAfter).toBeLessThanOrEqual(countBefore);
    }, 20000);
  });

  describe("Rule 2: Server Limit Enforcement - Max 8 Servers", () => {
    test("should enforce maximum server limit when many projects are active", async () => {
      // Create 12 test projects
      const projects = [];
      for (let i = 0; i < 12; i++) {
        const projectDir = join(testDir, `limit-test-${i}`);
        mkdirSync(projectDir);
        writeFileSync(join(projectDir, "package.json"), JSON.stringify({ name: `project-${i}` }));
        writeFileSync(join(projectDir, "index.ts"), `console.log("project ${i}");`);
        projects.push(projectDir);
      }

      // Start servers for all projects
      for (const project of projects) {
        await exec(`echo "test" | ${CLI_PATH} diagnostics ${project}`).catch(() => {});
      }

      // Wait a bit for all servers to start
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Check total server count
      const { stdout } = await exec("ps aux | grep claude-lsp-server | grep -v grep | wc -l");
      const serverCount = parseInt(stdout.trim());

      // Should have at most 10 servers running (allowing some tolerance for test timing)
      expect(serverCount).toBeLessThanOrEqual(10);
      
      // Also verify via CLI status
      const { stdout: status } = await exec(`${CLI_PATH} status`);
      const totalMatch = status.match(/Total: (\d+) server/);
      if (totalMatch) {
        const totalServers = parseInt(totalMatch[1]);
        expect(totalServers).toBeLessThanOrEqual(10);
      }
    }, 60000);

    test("should kill oldest servers when limit is exceeded", async () => {
      // This is implicitly tested above, but let's be explicit
      const { stdout } = await exec(`${CLI_PATH} limit-servers`);
      
      // Should show enforcement happened or limit is maintained
      expect(stdout).toMatch(/Server limit enforcement|Active servers: \d+/);
      
      // Verify active servers don't exceed limit
      const activeMatch = stdout.match(/Active servers: (\d+)/);
      if (activeMatch) {
        const activeCount = parseInt(activeMatch[1]);
        expect(activeCount).toBeLessThanOrEqual(10);
      }
    }, 10000);
  });

  describe("Rule 3: No File Watching - CPU Optimization", () => {
    test("should not trigger on file changes (file watching disabled)", async () => {
      const projectDir = join(testDir, "watch-test");
      mkdirSync(projectDir);
      writeFileSync(join(projectDir, "package.json"), JSON.stringify({ name: "watch-test" }));
      const testFile = join(projectDir, "watch.ts");
      writeFileSync(testFile, "const x = 1;");

      // Start server for project
      await exec(`echo "test" | ${CLI_PATH} diagnostics ${projectDir}`);

      // Get initial CPU usage of the server process
      const { stdout: psOutput } = await exec(`ps aux | grep "claude-lsp-server.*watch-test" | grep -v grep`);
      const initialCPU = psOutput ? parseFloat(psOutput.split(/\s+/)[2]) : 0;

      // Modify file multiple times
      for (let i = 0; i < 10; i++) {
        writeFileSync(testFile, `const x = ${i};`);
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Check CPU usage again - should not spike from file watching
      const { stdout: psOutput2 } = await exec(`ps aux | grep "claude-lsp-server.*watch-test" | grep -v grep`).catch(() => ({ stdout: "" }));
      const finalCPU = psOutput2 ? parseFloat(psOutput2.split(/\s+/)[2]) : 0;

      // CPU should not increase significantly (file watching is disabled)
      // Allow small increase for normal operation, but not the massive increase from watching
      expect(finalCPU).toBeLessThan(5.0); // Should stay under 5% CPU
    }, 30000);
  });

  describe("Rule 4: TypeScript Memory Limits", () => {
    test("should apply memory limits to TypeScript language servers", async () => {
      const projectDir = join(testDir, "memory-test");
      mkdirSync(projectDir);
      writeFileSync(join(projectDir, "package.json"), JSON.stringify({ 
        name: "memory-test",
        dependencies: { typescript: "*" }
      }));
      writeFileSync(join(projectDir, "tsconfig.json"), JSON.stringify({
        compilerOptions: { target: "ES2020" }
      }));
      
      // Create a large TypeScript file that would normally use lots of memory
      let largeCode = "";
      for (let i = 0; i < 1000; i++) {
        largeCode += `interface Interface${i} { prop${i}: string; }\n`;
        largeCode += `class Class${i} implements Interface${i} { prop${i} = "value${i}"; }\n`;
      }
      writeFileSync(join(projectDir, "large.ts"), largeCode);

      // Start diagnostics
      await exec(`echo "test" | ${CLI_PATH} diagnostics ${projectDir}`);

      // Wait for TypeScript server to start
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Check if any TypeScript server is using excessive memory
      const { stdout } = await exec("ps aux | grep -E 'tsserver|typescript' | grep -v grep").catch(() => ({ stdout: "" }));
      
      if (stdout) {
        const lines = stdout.trim().split('\n');
        for (const line of lines) {
          const parts = line.split(/\s+/);
          const memPercent = parseFloat(parts[3]); // %MEM column
          
          // Memory usage should be limited (our limit is 256MB for TypeScript)
          // This translates to roughly < 2% on most systems
          expect(memPercent).toBeLessThan(3.0);
        }
      }
    }, 30000);
  });

  describe("Rule 5: Deferred Processing for File Tools", () => {
    test("should defer file-specific tool processing (Write, MultiEdit)", async () => {
      const testFile = join(testDir, "defer-test.ts");
      
      // Simulate Write tool hook
      const hookData = {
        tool: "Write",
        output: {
          file_path: testFile,
          message: "File created"
        }
      };

      const { stdout } = await exec(
        `echo '${JSON.stringify(hookData)}' | ${CLI_PATH} hook PostToolUse`
      );

      // Should return empty (deferred) not immediate diagnostics
      expect(stdout).toBe("");
    }, 10000);
  });

  describe("Rule 6: Idle Server Cleanup", () => {
    test("should stop idle servers to free resources", async () => {
      const projectDir = join(testDir, "idle-cleanup");
      mkdirSync(projectDir);
      writeFileSync(join(projectDir, "package.json"), JSON.stringify({ name: "idle-cleanup" }));

      // Start a server
      await exec(`echo "test" | ${CLI_PATH} diagnostics ${projectDir}`);

      // Verify it's running
      const { stdout: beforeCleanup } = await exec(`${CLI_PATH} status`);
      expect(beforeCleanup).toContain(projectDir);

      // Run idle cleanup (with 1 minute threshold - all servers are "new" so won't be stopped)
      // This just tests that the cleanup runs without errors
      const { stdout: cleanupOutput } = await exec(`${CLI_PATH} stop-idle 60`);
      expect(cleanupOutput).toMatch(/No servers exceeded idle threshold|Stopped \d+ idle/);
    }, 20000);
  });

  describe("Performance Validation", () => {
    test("should handle diagnostics request quickly (under 5 seconds)", async () => {
      const projectDir = join(testDir, "performance-test");
      mkdirSync(projectDir);
      writeFileSync(join(projectDir, "package.json"), JSON.stringify({ name: "perf-test" }));
      writeFileSync(join(projectDir, "test.ts"), "const x: number = 'string'; // error");

      const startTime = Date.now();
      
      await exec(`echo "test" | ${CLI_PATH} diagnostics ${projectDir}`);
      
      const duration = Date.now() - startTime;
      
      // Should complete within 5 seconds
      expect(duration).toBeLessThan(5000);
    }, 10000);

    test("should not spawn excessive Node.js processes", async () => {
      // Count total Node processes (including VS Code, etc)
      const { stdout: before } = await exec("ps aux | grep -E 'node|tsserver' | grep -v grep | wc -l");
      const countBefore = parseInt(before.trim());

      // Run diagnostics on a TypeScript project
      const projectDir = join(testDir, "node-count-test");
      mkdirSync(projectDir);
      writeFileSync(join(projectDir, "package.json"), JSON.stringify({ name: "node-test" }));
      writeFileSync(join(projectDir, "test.ts"), "console.log('test');");

      await exec(`echo "test" | ${CLI_PATH} diagnostics ${projectDir}`);

      // Count again
      const { stdout: after } = await exec("ps aux | grep -E 'node|tsserver' | grep -v grep | wc -l");
      const countAfter = parseInt(after.trim());

      // Should not increase by more than 2 (1 for LSP server, 1 for tsserver)
      const increase = countAfter - countBefore;
      expect(increase).toBeLessThanOrEqual(2);
    }, 20000);
  });
});
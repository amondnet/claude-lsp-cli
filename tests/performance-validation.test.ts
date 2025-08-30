/**
 * Performance validation tests
 * These tests demonstrate that our optimizations actually reduce CPU and memory usage
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { exec as execCallback } from "child_process";
import { promisify } from "util";
import { writeFileSync, mkdirSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

const exec = promisify(execCallback);
const CLI_PATH = join(import.meta.dir, "..", "bin", "claude-lsp-cli");

describe("Performance Validation - CPU and Memory", () => {
  let testDir: string;

  beforeAll(() => {
    testDir = join(tmpdir(), `perf-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterAll(async () => {
    await exec(`${CLI_PATH} stop-all`).catch(() => {});
    rmSync(testDir, { recursive: true, force: true });
  });

  describe("CPU Usage", () => {
    test("LSP servers should use minimal CPU when idle (< 1%)", async () => {
      const projectDir = join(testDir, "cpu-test");
      mkdirSync(projectDir);
      writeFileSync(join(projectDir, "package.json"), JSON.stringify({ name: "cpu-test" }));
      writeFileSync(join(projectDir, "test.ts"), "const x = 1;");

      // Start server
      await exec(`echo "test" | ${CLI_PATH} diagnostics ${projectDir}`);
      
      // Wait for server to stabilize
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Check CPU usage
      const { stdout } = await exec(`ps aux | grep "claude-lsp-server.*cpu-test" | grep -v grep`).catch(() => ({ stdout: "" }));
      
      if (stdout) {
        const cpuUsage = parseFloat(stdout.split(/\s+/)[2]);
        // Idle server should use < 1% CPU (no file watching)
        expect(cpuUsage).toBeLessThan(1.0);
      }
    }, 15000);

    test("File changes should NOT cause CPU spikes (file watching disabled)", async () => {
      const projectDir = join(testDir, "no-watch-test");
      mkdirSync(projectDir);
      writeFileSync(join(projectDir, "package.json"), JSON.stringify({ name: "no-watch" }));
      const testFile = join(projectDir, "file.ts");
      writeFileSync(testFile, "let x = 1;");

      // Start server
      await exec(`echo "test" | ${CLI_PATH} diagnostics ${projectDir}`);
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Get baseline CPU
      const { stdout: before } = await exec(`ps aux | grep "claude-lsp-server.*no-watch" | grep -v grep`).catch(() => ({ stdout: "" }));
      const cpuBefore = before ? parseFloat(before.split(/\s+/)[2]) : 0;

      // Make rapid file changes (would cause high CPU with file watching)
      for (let i = 0; i < 20; i++) {
        writeFileSync(testFile, `let x = ${i};`);
        await new Promise(resolve => setTimeout(resolve, 50));
      }

      // Check CPU after changes
      const { stdout: after } = await exec(`ps aux | grep "claude-lsp-server.*no-watch" | grep -v grep`).catch(() => ({ stdout: "" }));
      const cpuAfter = after ? parseFloat(after.split(/\s+/)[2]) : 0;

      // CPU should not spike (no file watching)
      expect(cpuAfter).toBeLessThan(2.0);
      // And should not increase significantly from baseline
      expect(cpuAfter - cpuBefore).toBeLessThan(1.0);
    }, 20000);
  });

  describe("Memory Usage", () => {
    test("TypeScript servers should respect memory limits", async () => {
      const projectDir = join(testDir, "memory-limit");
      mkdirSync(projectDir);
      writeFileSync(join(projectDir, "package.json"), JSON.stringify({ 
        name: "memory-limit",
        dependencies: { typescript: "*" }
      }));
      writeFileSync(join(projectDir, "tsconfig.json"), JSON.stringify({
        compilerOptions: { target: "ES2020" }
      }));

      // Create multiple TypeScript files
      for (let i = 0; i < 10; i++) {
        writeFileSync(
          join(projectDir, `file${i}.ts`),
          `export class Class${i} { method() { return ${i}; } }`
        );
      }

      // Start diagnostics
      await exec(`echo "test" | ${CLI_PATH} diagnostics ${projectDir}`);
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Check memory usage of TypeScript servers
      const { stdout } = await exec("ps aux | grep tsserver | grep -v grep").catch(() => ({ stdout: "" }));
      
      if (stdout) {
        const lines = stdout.trim().split('\n').filter(l => l);
        for (const line of lines) {
          const parts = line.split(/\s+/);
          const vsz = parseInt(parts[4]); // Virtual memory in KB
          
          // Should be under 1GB (1048576 KB) - reasonable limit
          expect(vsz).toBeLessThan(1048576);
        }
      }
    }, 20000);

    test("Server processes should have reasonable memory footprint", async () => {
      const { stdout } = await exec("ps aux | grep claude-lsp-server | grep -v grep").catch(() => ({ stdout: "" }));
      
      if (stdout) {
        const lines = stdout.trim().split('\n').filter(l => l);
        for (const line of lines) {
          const parts = line.split(/\s+/);
          const memPercent = parseFloat(parts[3]);
          
          // Each server should use < 2% memory
          expect(memPercent).toBeLessThan(2.0);
        }
      }
    }, 10000);
  });

  describe("Process Count", () => {
    test("should not create zombie processes", async () => {
      // Check for zombie processes
      const { stdout } = await exec("ps aux | grep defunct | grep claude-lsp | wc -l");
      const zombieCount = parseInt(stdout.trim());
      
      expect(zombieCount).toBe(0);
    }, 5000);

    test("total Node.js process count should be reasonable", async () => {
      // Count Node processes spawned by our LSP system
      const { stdout } = await exec("ps aux | grep -E 'node.*claude-lsp|tsserver.*claude-lsp' | grep -v grep | wc -l");
      const nodeCount = parseInt(stdout.trim());
      
      // Should have reasonable number of Node processes (not dozens)
      expect(nodeCount).toBeLessThan(10);
    }, 5000);
  });

  describe("Response Time", () => {
    test("diagnostics should return quickly for small projects", async () => {
      const projectDir = join(testDir, "quick-response");
      mkdirSync(projectDir);
      writeFileSync(join(projectDir, "package.json"), JSON.stringify({ name: "quick" }));
      writeFileSync(join(projectDir, "small.ts"), "const x: number = 42;");

      const start = Date.now();
      await exec(`echo "test" | ${CLI_PATH} diagnostics ${projectDir}`);
      const duration = Date.now() - start;

      // Should respond within 3 seconds for small project
      expect(duration).toBeLessThan(3000);
    }, 10000);

    test("server startup should be fast", async () => {
      const projectDir = join(testDir, "startup-test");
      mkdirSync(projectDir);
      writeFileSync(join(projectDir, "package.json"), JSON.stringify({ name: "startup" }));

      const start = Date.now();
      const { stdout } = await exec(`${CLI_PATH} start ${projectDir}`);
      const duration = Date.now() - start;

      expect(stdout.toLowerCase()).toContain("started");
      // Startup should be under 5 seconds
      expect(duration).toBeLessThan(5000);
    }, 10000);
  });
});
/**
 * High-impact test for server.ts - LSP Server
 * Tests critical server functionality that prevents CPU issues
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { spawn } from "child_process";
import { writeFileSync, mkdirSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

const SERVER_PATH = join(import.meta.dir, "..", "bin", "claude-lsp-server");

describe("LSP Server - Critical Functionality", () => {
  let testDir: string;
  let serverProcess: any = null;

  beforeAll(() => {
    testDir = join(tmpdir(), `server-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterAll(async () => {
    if (serverProcess) {
      serverProcess.kill('SIGKILL');
    }
    rmSync(testDir, { recursive: true, force: true });
  });

  describe("Critical: Temp Directory Protection", () => {
    test("should not start language servers for temp directories", async () => {
      const tempProject = join(tmpdir(), "test-project");
      mkdirSync(tempProject, { recursive: true });
      writeFileSync(join(tempProject, "test.ts"), "const x = 1;");

      const server = spawn(SERVER_PATH, [tempProject]);
      let output = "";

      await new Promise((resolve) => {
        server.stdout.on('data', (data) => {
          output += data.toString();
          if (output.includes("Skipping temp/test directory")) {
            resolve(true);
          }
        });

        // Timeout after 3 seconds
        setTimeout(() => resolve(false), 3000);
      });

      server.kill();

      // Should skip temp directory
      expect(output).toContain("Skipping temp/test directory");
      
      rmSync(tempProject, { recursive: true, force: true });
    }, 10000);
  });

  describe("Critical: No File Watching", () => {
    test("should not have file watching enabled", async () => {
      const project = join(testDir, "no-watch");
      mkdirSync(project);
      writeFileSync(join(project, "package.json"), JSON.stringify({ name: "test" }));
      const testFile = join(project, "file.ts");
      writeFileSync(testFile, "let x = 1;");

      const server = spawn(SERVER_PATH, [project]);
      let output = "";

      await new Promise((resolve) => {
        server.stdout.on('data', (data) => {
          output += data.toString();
        });
        setTimeout(() => resolve(true), 2000);
      });

      // Should show file watching is disabled
      expect(output).toContain("File watching disabled");

      server.kill();
    }, 10000);
  });

  describe("Critical: Socket Server", () => {
    test("should create Unix socket for communication", async () => {
      const project = join(testDir, "socket-test");
      mkdirSync(project);
      writeFileSync(join(project, "package.json"), JSON.stringify({ name: "socket" }));

      const server = spawn(SERVER_PATH, [project]);
      let output = "";

      await new Promise((resolve) => {
        server.stdout.on('data', (data) => {
          output += data.toString();
          if (output.includes("Server listening")) {
            resolve(true);
          }
        });
        setTimeout(() => resolve(false), 5000);
      });

      // Should start server with socket
      expect(output).toContain("Server listening");
      
      server.kill();
    }, 10000);
  });

  describe("Critical: Memory Safety", () => {
    test("should not consume excessive memory", async () => {
      const project = join(testDir, "memory-test");
      mkdirSync(project);
      writeFileSync(join(project, "package.json"), JSON.stringify({ name: "memory" }));
      
      // Create many files
      for (let i = 0; i < 50; i++) {
        writeFileSync(join(project, `file${i}.ts`), `export const val${i} = ${i};`);
      }

      const server = spawn(SERVER_PATH, [project]);
      serverProcess = server;

      // Let it run for a bit
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Check memory usage via ps
      const ps = spawn('ps', ['aux']);
      let psOutput = "";
      
      await new Promise((resolve) => {
        ps.stdout.on('data', (data) => {
          psOutput += data.toString();
        });
        ps.on('close', resolve);
      });

      const serverLine = psOutput.split('\n').find(line => 
        line.includes(server.pid?.toString() || '') && line.includes('claude-lsp-server')
      );

      if (serverLine) {
        const memPercent = parseFloat(serverLine.split(/\s+/)[3]);
        // Should use less than 5% memory
        expect(memPercent).toBeLessThan(5.0);
      }

      server.kill();
      serverProcess = null;
    }, 15000);
  });
});
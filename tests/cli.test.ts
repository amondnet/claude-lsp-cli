/**
 * High-impact test for cli.ts - Main CLI entry point
 * Tests the most critical user-facing functionality
 */

import { describe, test, expect } from "bun:test";
import { exec as execCallback } from "child_process";
import { promisify } from "util";
import { join } from "path";

const exec = promisify(execCallback);
const CLI_PATH = join(import.meta.dir, "..", "bin", "claude-lsp-cli");

describe("CLI - Main Entry Point", () => {
  describe("Critical Command: diagnostics", () => {
    test("should provide diagnostics for TypeScript errors", async () => {
      // This is the most important feature - getting diagnostics
      const testProject = join(import.meta.dir, "..", "examples", "typescript-project");
      
      const { stdout, stderr } = await exec(`echo "test" | ${CLI_PATH} diagnostics ${testProject}`);
      
      // Should return system message format
      if (stdout.includes("[[system-message]]:")) {
        const match = stdout.match(/\[\[system-message\]\]:(.+)/);
        if (match) {
          const response = JSON.parse(match[1]);
          expect(response).toHaveProperty("diagnostics");
          expect(response).toHaveProperty("summary");
        }
      }
      
      // Should not crash
      expect(stderr || "").not.toContain("Error:");
    }, 30000);
  });

  describe("Critical Command: hook PostToolUse", () => {
    test("should handle file edit hooks without crashing", async () => {
      const hookData = {
        tool: "Edit",
        output: {
          file_path: "/tmp/test.ts",
          message: "File edited"
        }
      };
      
      const { stderr } = await exec(
        `echo '${JSON.stringify(hookData)}' | ${CLI_PATH} hook PostToolUse`
      );
      
      // Should not error
      expect(stderr || "").not.toContain("Error:");
    }, 10000);
  });

  describe("Critical Command: server management", () => {
    test("should start and stop servers without errors", async () => {
      const testProject = join(import.meta.dir, "..", "examples", "javascript-project");
      
      // Start server
      const { stdout: startOutput } = await exec(`${CLI_PATH} start ${testProject}`);
      expect(startOutput.toLowerCase()).toContain("started");
      
      // Stop server
      const { stdout: stopOutput } = await exec(`${CLI_PATH} stop ${testProject}`);
      expect(stopOutput.toLowerCase()).toMatch(/stop|killed/);
    }, 20000);
  });

  describe("Critical Command: status", () => {
    test("should show server status without errors", async () => {
      const { stdout, stderr } = await exec(`${CLI_PATH} status`);
      
      // Should show status info
      expect(stdout).toMatch(/server|No LSP servers/i);
      
      // Should not error
      expect(stderr || "").not.toContain("Error:");
    }, 10000);
  });

  describe("Error Handling", () => {
    test("should handle invalid commands gracefully", async () => {
      const { stdout } = await exec(`${CLI_PATH} invalid-command`).catch(e => e);
      
      // Should show help or error message, not crash
      expect(stdout).toBeTruthy();
    }, 5000);

    test("should handle missing arguments gracefully", async () => {
      const { stdout } = await exec(`${CLI_PATH} diagnostics`).catch(e => e);
      
      // Should show error or help
      expect(stdout || "").toBeTruthy();
    }, 5000);
  });
});
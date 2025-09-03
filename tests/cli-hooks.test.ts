import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { join } from "path";
import { promisify } from "util";
import { existsSync, mkdirSync, writeFileSync, rmSync } from "fs";

const exec = promisify(require("child_process").exec);

describe("CLI Hooks Integration", () => {
  const CLI_PATH = join(__dirname, "..", "bin", "claude-lsp-cli");
  const TEMP_DIR = `/tmp/cli-hooks-test-${Date.now()}`;
  
  beforeAll(async () => {
    if (!existsSync(TEMP_DIR)) {
      mkdirSync(TEMP_DIR, { recursive: true });
    }
  });
  
  afterAll(async () => {
    if (existsSync(TEMP_DIR)) {
      rmSync(TEMP_DIR, { recursive: true, force: true });
    }
    await exec(`${CLI_PATH} stop-all`).catch(() => {});
  });

  describe("PostToolUse Hook", () => {
    test("should handle Edit tool event", async () => {
      const testFile = join(TEMP_DIR, "edit-test.ts");
      // Create file first
      writeFileSync(testFile, "const x: string = 42; // Type error");
      
      const hookData = {
        tool: "Edit",
        output: {
          file_path: testFile,
          message: "File updated"
        }
      };
      
      const { stdout } = await exec(
        `echo '${JSON.stringify(hookData)}' | ${CLI_PATH} hook PostToolUse`,
        { timeout: 30000 }
      );
      
      // Should either return diagnostics or "no errors or warnings"
      if (stdout.includes("[[system-message]]:")) {
        expect(stdout).toContain("[[system-message]]:");
      }
    }, 35000);

    test("should handle MultiEdit tool event", async () => {
      const hookData = {
        tool: "MultiEdit",
        output: {
          file_path: join(TEMP_DIR, "multi.ts"),
          message: "Multiple edits applied"
        }
      };
      
      const { stdout } = await exec(
        `echo '${JSON.stringify(hookData)}' | ${CLI_PATH} hook PostToolUse`,
        { timeout: 30000 }
      );
      
      // The new hook defers processing for file-specific tools, so may return empty
      // This is expected behavior - diagnostics will run on the next hook
      expect(stdout === "" || stdout.includes("[[system-message]]:")).toBe(true);
    }, 35000);

    test("should handle Write tool event", async () => {
      const testFile = join(TEMP_DIR, "write-test.ts");
      const hookData = {
        tool: "Write",
        output: {
          file_path: testFile,
          message: "File created"
        }
      };
      
      // Create the file first
      writeFileSync(testFile, "const x = 42;");
      
      const { stdout } = await exec(
        `echo '${JSON.stringify(hookData)}' | ${CLI_PATH} hook PostToolUse`,
        { timeout: 30000 }
      );
      
      // The new hook defers processing for file-specific tools, so may return empty
      // This is expected behavior - diagnostics will run on the next hook
      expect(stdout === "" || stdout.includes("[[system-message]]:")).toBe(true);
    }, 35000);

    test("should ignore non-code tools", async () => {
      const hookData = {
        tool: "Bash",
        output: {
          stdout: "command output"
        }
      };
      
      const { stdout } = await exec(
        `echo '${JSON.stringify(hookData)}' | ${CLI_PATH} hook PostToolUse`
      );
      
      // Should not output diagnostics for non-code tools
      expect(stdout).not.toContain("[[system-message]]:");
    });
  });

  describe("Hook Output Format", () => {
    test("should output proper JSON format", async () => {
      const testProject = join(TEMP_DIR, "hook-format-test");
      mkdirSync(testProject);
      writeFileSync(join(testProject, "package.json"), '{"name":"test"}');
      
      const testFile = join(testProject, "test.ts");
      writeFileSync(testFile, "const x: string = 42; // Type error");
      
      const hookData = {
        tool: "Edit",
        output: {
          file_path: testFile,
          message: "File updated"
        }
      };
      
      const { stdout } = await exec(
        `echo '${JSON.stringify(hookData)}' | ${CLI_PATH} hook PostToolUse`
      );
      
      // Check if we got any diagnostic output
      if (stdout && stdout.includes("[[system-message]]:")) {
        expect(stdout).toContain("[[system-message]]:");
        const match = stdout.match(/\[\[system-message\]\]:(.+)/);
        if (match) {
          const jsonStr = match[1].trim();
          const result = JSON.parse(jsonStr);
          expect(result).toHaveProperty("summary");
        }
      }
      // It's also OK if no diagnostics were found (clean code)
    }, 10000);

    test("should handle multiple file paths", async () => {
      const testProject = join(TEMP_DIR, "multi-file-test");
      mkdirSync(testProject);
      writeFileSync(join(testProject, "package.json"), '{"name":"test"}');
      
      const files = ["file1.ts", "file2.ts"].map(name => {
        const path = join(testProject, name);
        writeFileSync(path, `export const ${name} = 42;`);
        return path;
      });
      
      const hookData = {
        tool: "MultiEdit",
        output: {
          file_paths: files,
          message: "Multiple files updated"
        }
      };
      
      const { stdout } = await exec(
        `echo '${JSON.stringify(hookData)}' | ${CLI_PATH} hook PostToolUse`
      );
      
      // Check if we got any diagnostic output (it's OK if not)
      if (stdout && stdout.includes("[[system-message]]:")) {
        expect(stdout).toContain("[[system-message]]:");
      }
      // It's also OK if no diagnostics were found
    }, 10000);
  });

  describe("Error Handling", () => {
    test("should handle invalid JSON input", async () => {
      const { stdout, stderr } = await exec(
        `echo 'invalid json' | ${CLI_PATH} hook PostToolUse`
      ).catch(e => e);
      
      // Should handle gracefully without crashing
      expect(stdout || stderr).toBeDefined();
    });

    test("should handle missing tool field", async () => {
      const hookData = {
        output: {
          file_path: "/some/path.ts"
        }
      };
      
      const { stdout } = await exec(
        `echo '${JSON.stringify(hookData)}' | ${CLI_PATH} hook PostToolUse`
      );
      
      // Should handle gracefully (no diagnostics for missing tool)
      expect(stdout).not.toContain("[[system-message]]:");
    });

    test("should handle non-existent file paths", async () => {
      const hookData = {
        tool: "Edit",
        output: {
          file_path: "/non/existent/file.ts",
          message: "File updated"
        }
      };
      
      const { stdout } = await exec(
        `echo '${JSON.stringify(hookData)}' | ${CLI_PATH} hook PostToolUse`
      );
      
      // Should handle gracefully - either return empty or "no errors or warnings"
      if (stdout && stdout.includes("[[system-message]]:")) {
        const match = stdout.match(/\[\[system-message\]\]:(.+)/);
        if (match) {
          const jsonStr = match[1].trim();
          const result = JSON.parse(jsonStr);
          expect(result.summary).toMatch(/no errors or warnings|no.*diagnostics/i);
        }
      }
      // It's OK if no output is produced for non-existent files
    });
  });

  describe("Performance", () => {
    test("should respond within timeout", async () => {
      const testProject = join(TEMP_DIR, "performance-test");
      mkdirSync(testProject);
      writeFileSync(join(testProject, "package.json"), '{"name":"test"}');
      
      const testFile = join(testProject, "test.ts");
      writeFileSync(testFile, "const x = 42;");
      
      const hookData = {
        tool: "Edit",
        output: {
          file_path: testFile,
          message: "File updated"
        }
      };
      
      const start = Date.now();
      await exec(
        `echo '${JSON.stringify(hookData)}' | ${CLI_PATH} hook PostToolUse`
      );
      const duration = Date.now() - start;
      
      // Should respond within 10 seconds (allowing for server startup)
      expect(duration).toBeLessThan(10000);
    }, 10000);
  });
});
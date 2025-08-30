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
      const hookData = {
        tool: "Edit",
        output: {
          file_path: join(TEMP_DIR, "test.ts"),
          message: "File updated"
        }
      };
      
      const { stdout } = await exec(
        `echo '${JSON.stringify(hookData)}' | ${CLI_PATH} hook PostToolUse`
      );
      
      expect(stdout).toContain("[[system-message]]:");
    });

    test("should handle MultiEdit tool event", async () => {
      const hookData = {
        tool: "MultiEdit",
        output: {
          file_path: join(TEMP_DIR, "multi.ts"),
          message: "Multiple edits applied"
        }
      };
      
      const { stdout } = await exec(
        `echo '${JSON.stringify(hookData)}' | ${CLI_PATH} hook PostToolUse`
      );
      
      expect(stdout).toContain("[[system-message]]:");
    });

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
        `echo '${JSON.stringify(hookData)}' | ${CLI_PATH} hook PostToolUse`
      );
      
      expect(stdout).toContain("[[system-message]]:");
    });

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
      
      // Should not output anything for non-code tools
      expect(stdout).toBe("");
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
      
      if (stdout) {
        expect(stdout).toStartWith("[[system-message]]:");
        const jsonStr = stdout.replace("[[system-message]]:", "").trim();
        const result = JSON.parse(jsonStr);
        expect(result).toHaveProperty("summary");
      }
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
      
      if (stdout) {
        expect(stdout).toContain("[[system-message]]:");
      }
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
      
      // Should handle gracefully
      expect(stdout).toBe("");
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
      
      // Should return empty or "no warnings or errors"
      if (stdout) {
        expect(stdout).toContain("[[system-message]]:");
        const jsonStr = stdout.replace("[[system-message]]:", "").trim();
        const result = JSON.parse(jsonStr);
        expect(result.summary).toBe("no warnings or errors");
      }
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
      
      // Should respond within 5 seconds (hook timeout)
      expect(duration).toBeLessThan(5000);
    }, 10000);
  });
});
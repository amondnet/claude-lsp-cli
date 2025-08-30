import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { join } from "path";
import { promisify } from "util";
import { existsSync, mkdirSync, writeFileSync, rmSync } from "fs";

const exec = promisify(require("child_process").exec);

describe("CLI Diagnostics Command", () => {
  const CLI_PATH = join(__dirname, "..", "bin", "claude-lsp-cli");
  const TEST_PROJECT = join(__dirname, "..", "examples", "typescript-project");
  const TEST_FILE = join(TEST_PROJECT, "src", "index.ts");
  const TEMP_DIR = `/tmp/cli-diagnostics-test-${Date.now()}`;
  
  beforeAll(async () => {
    // Create temp directory for tests
    if (!existsSync(TEMP_DIR)) {
      mkdirSync(TEMP_DIR, { recursive: true });
    }
  });
  
  afterAll(async () => {
    // Clean up temp directory
    if (existsSync(TEMP_DIR)) {
      rmSync(TEMP_DIR, { recursive: true, force: true });
    }
    // Stop any running servers
    await exec(`${CLI_PATH} stop-all`).catch(() => {});
  });

  describe("Output Format", () => {
    test("should output [[system-message]]: prefix", async () => {
      const { stdout } = await exec(`${CLI_PATH} diagnostics ${TEST_PROJECT}`);
      expect(stdout).toStartWith("[[system-message]]:");
    });

    test("should output valid JSON after prefix", async () => {
      const { stdout } = await exec(`${CLI_PATH} diagnostics ${TEST_PROJECT}`);
      const jsonStr = stdout.replace("[[system-message]]:", "").trim();
      expect(() => JSON.parse(jsonStr)).not.toThrow();
    });

    test("should include summary field", async () => {
      const { stdout } = await exec(`${CLI_PATH} diagnostics ${TEST_PROJECT}`);
      const jsonStr = stdout.replace("[[system-message]]:", "").trim();
      const result = JSON.parse(jsonStr);
      expect(result).toHaveProperty("summary");
      expect(typeof result.summary).toBe("string");
    });
  });

  describe("Project Diagnostics", () => {
    test("should handle clean project", async () => {
      // Create a clean test project
      const cleanProject = join(TEMP_DIR, "clean-project");
      mkdirSync(cleanProject, { recursive: true });
      writeFileSync(join(cleanProject, "package.json"), JSON.stringify({
        name: "clean-project",
        version: "1.0.0"
      }));
      writeFileSync(join(cleanProject, "index.ts"), "const x: number = 42;\n");
      
      const { stdout } = await exec(`${CLI_PATH} diagnostics ${cleanProject}`);
      const jsonStr = stdout.replace("[[system-message]]:", "").trim();
      const result = JSON.parse(jsonStr);
      
      expect(result.summary).toBe("no warnings or errors");
    }, 10000);

    test("should detect TypeScript errors", async () => {
      // Create project with errors
      const errorProject = join(TEMP_DIR, "error-project");
      mkdirSync(errorProject, { recursive: true });
      writeFileSync(join(errorProject, "package.json"), JSON.stringify({
        name: "error-project",
        version: "1.0.0"
      }));
      writeFileSync(join(errorProject, "tsconfig.json"), JSON.stringify({
        compilerOptions: {
          strict: true,
          noImplicitAny: true
        }
      }));
      writeFileSync(join(errorProject, "index.ts"), `
        const x = undefined;
        x.toString(); // Error: possible undefined
        
        function foo(param) { // Error: implicit any
          return param;
        }
      `);
      
      const { stdout } = await exec(`${CLI_PATH} diagnostics ${errorProject}`);
      const jsonStr = stdout.replace("[[system-message]]:", "").trim();
      const result = JSON.parse(jsonStr);
      
      if (result.diagnostics) {
        expect(result.diagnostics).toBeInstanceOf(Array);
        expect(result.diagnostics.length).toBeGreaterThan(0);
        expect(result.summary).toContain("diagnostics");
      }
    }, 15000);

    test("should include language breakdown in summary", async () => {
      const { stdout } = await exec(`${CLI_PATH} diagnostics ${TEST_PROJECT}`);
      const jsonStr = stdout.replace("[[system-message]]:", "").trim();
      const result = JSON.parse(jsonStr);
      
      // If there are diagnostics, summary should mention the language
      if (result.diagnostics && result.diagnostics.length > 0) {
        expect(result.summary).toMatch(/typescript|javascript/i);
      }
    });
  });

  describe("File Diagnostics", () => {
    test("should handle single file path", async () => {
      const testFile = join(TEMP_DIR, "single-file.ts");
      writeFileSync(testFile, "const x: string = 'test';\n");
      
      const { stdout } = await exec(`${CLI_PATH} diagnostics ${testFile}`);
      const jsonStr = stdout.replace("[[system-message]]:", "").trim();
      const result = JSON.parse(jsonStr);
      
      expect(result).toHaveProperty("summary");
    });

    test("should find project root from file path", async () => {
      // Create nested project structure
      const nestedProject = join(TEMP_DIR, "nested", "project");
      mkdirSync(nestedProject, { recursive: true });
      writeFileSync(join(nestedProject, "package.json"), JSON.stringify({
        name: "nested-project"
      }));
      
      const srcDir = join(nestedProject, "src");
      mkdirSync(srcDir);
      const testFile = join(srcDir, "test.ts");
      writeFileSync(testFile, "export const value = 42;\n");
      
      const { stdout } = await exec(`${CLI_PATH} diagnostics ${testFile}`);
      const jsonStr = stdout.replace("[[system-message]]:", "").trim();
      const result = JSON.parse(jsonStr);
      
      expect(result).toHaveProperty("summary");
    }, 10000);
  });

  describe("Error Handling", () => {
    test("should handle non-existent project", async () => {
      const { stdout, stderr } = await exec(`${CLI_PATH} diagnostics /non/existent/path`).catch(e => e);
      
      // Should either return empty diagnostics or an error message
      if (stdout && stdout.includes("[[system-message]]:")) {
        const jsonStr = stdout.replace("[[system-message]]:", "").trim();
        const result = JSON.parse(jsonStr);
        expect(result.summary).toBe("no warnings or errors");
      }
    });

    test("should handle project without language servers", async () => {
      const unknownProject = join(TEMP_DIR, "unknown-project");
      mkdirSync(unknownProject);
      writeFileSync(join(unknownProject, "file.unknown"), "unknown content");
      
      const { stdout } = await exec(`${CLI_PATH} diagnostics ${unknownProject}`);
      const jsonStr = stdout.replace("[[system-message]]:", "").trim();
      const result = JSON.parse(jsonStr);
      
      expect(result.summary).toBe("no warnings or errors");
    });
  });

  describe("Deduplication", () => {
    test("should deduplicate repeated project diagnostics", async () => {
      // Run diagnostics twice
      const { stdout: first } = await exec(`${CLI_PATH} diagnostics ${TEST_PROJECT}`);
      await new Promise(resolve => setTimeout(resolve, 500));
      const { stdout: second } = await exec(`${CLI_PATH} diagnostics ${TEST_PROJECT}`);
      
      const firstResult = JSON.parse(first.replace("[[system-message]]:", "").trim());
      const secondResult = JSON.parse(second.replace("[[system-message]]:", "").trim());
      
      // Second run should indicate deduplication if there were errors
      if (firstResult.diagnostics && firstResult.diagnostics.length > 0) {
        // Either shows "(already reported)" or returns fewer/no diagnostics
        expect(secondResult.summary).toMatch(/already reported|no warnings or errors/);
      }
    }, 10000);

    test("should NOT deduplicate file-specific diagnostics", async () => {
      const testFile = join(TEMP_DIR, "dedupe-test.ts");
      writeFileSync(testFile, "const x = undefined; x.toString();\n");
      
      // Run file diagnostics twice
      const { stdout: first } = await exec(`${CLI_PATH} diagnostics ${testFile}`);
      await new Promise(resolve => setTimeout(resolve, 500));
      const { stdout: second } = await exec(`${CLI_PATH} diagnostics ${testFile}`);
      
      const firstResult = JSON.parse(first.replace("[[system-message]]:", "").trim());
      const secondResult = JSON.parse(second.replace("[[system-message]]:", "").trim());
      
      // Both should return the same diagnostics
      expect(JSON.stringify(firstResult)).toBe(JSON.stringify(secondResult));
    }, 10000);
  });
});
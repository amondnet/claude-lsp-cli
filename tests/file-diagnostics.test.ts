import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { join } from "path";
import { promisify } from "util";

const exec = promisify(require("child_process").exec);

describe("File-specific vs Project-wide Diagnostics", () => {
  const CLI_PATH = join(__dirname, "..", "bin", "claude-lsp-cli");
  const TEST_PROJECT = join(__dirname, "..", "examples", "typescript-project");
  const TEST_FILE = join(TEST_PROJECT, "src", "index.ts");
  
  beforeAll(async () => {
    // Ensure server is started for the test project
    await exec(`${CLI_PATH} start ${TEST_PROJECT}`).catch(() => {});
    // Wait longer for server to initialize and detect TypeScript
    await new Promise(resolve => setTimeout(resolve, 5000));
  });
  
  afterAll(async () => {
    // Stop server after tests
    await exec(`${CLI_PATH} stop ${TEST_PROJECT}`).catch(() => {});
  });
  
  test("file-specific diagnostics bypass deduplication", async () => {
    // Run file-specific diagnostics
    const { stdout } = await exec(`${CLI_PATH} diagnostics ${TEST_FILE}`);
    const result = JSON.parse(stdout);
    
    // Check structure specific to file diagnostics
    expect(result).toHaveProperty("file_metadata");
    expect(result.file_metadata).toHaveProperty("file_name", "index.ts");
    expect(result.file_metadata).toHaveProperty("project_root", TEST_PROJECT);
    expect(result.file_metadata).toHaveProperty("error_count");
    expect(result.file_metadata).toHaveProperty("warning_count");
    expect(result.file_metadata).toHaveProperty("last_modified");
    expect(result.file_metadata).toHaveProperty("checked_at");
    
    // Should NOT have by_source field (that's only for project-wide)
    expect(result).not.toHaveProperty("by_source");
    
    // Should have diagnostics
    expect(result.diagnostics).toBeInstanceOf(Array);
    expect(result.total_count).toBeGreaterThan(0);
  }, 15000);
  
  test("project-wide diagnostics use deduplication", async () => {
    // Run project-wide diagnostics
    const { stdout } = await exec(`${CLI_PATH} diagnostics ${TEST_PROJECT}`);
    const result = JSON.parse(stdout);
    
    // Check structure specific to project diagnostics
    expect(result).toHaveProperty("by_source");
    expect(result.by_source).toHaveProperty("typescript");
    
    // Should NOT have file_metadata field (that's only for file-specific)
    expect(result).not.toHaveProperty("file_metadata");
    
    // Should have diagnostics
    expect(result.diagnostics).toBeInstanceOf(Array);
    expect(result.total_count).toBeGreaterThan(0);
    
    // Summary should include language breakdown
    expect(result.summary).toMatch(/typescript/);
  }, 15000);
  
  test("file diagnostics return all errors for that file", async () => {
    // Run twice to ensure no deduplication
    const { stdout: first } = await exec(`${CLI_PATH} diagnostics ${TEST_FILE}`);
    const firstResult = JSON.parse(first);
    
    // Wait a moment
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const { stdout: second } = await exec(`${CLI_PATH} diagnostics ${TEST_FILE}`);
    const secondResult = JSON.parse(second);
    
    // Both should return the same diagnostics (no deduplication)
    expect(firstResult.diagnostics.length).toBe(secondResult.diagnostics.length);
    expect(firstResult.total_count).toBe(secondResult.total_count);
  }, 15000);
  
  test("file diagnostics find correct project root", async () => {
    const { stdout } = await exec(`${CLI_PATH} diagnostics ${TEST_FILE}`);
    const result = JSON.parse(stdout);
    
    // Should find examples/typescript-project as root, not the parent
    expect(result.file_metadata.project_root).toBe(TEST_PROJECT);
    // Project root should end with examples/typescript-project, not just be examples
    expect(result.file_metadata.project_root).toMatch(/examples\/typescript-project$/);
  }, 10000);
});
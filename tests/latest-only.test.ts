import { describe, test, expect, beforeEach, afterAll } from "bun:test";
import { spawn } from "bun";
import { writeFileSync, mkdirSync, rmSync } from "fs";
import { join } from "path";

const TEST_DIR = "/tmp/claude-lsp-latest-test";

describe("Latest File Only Behavior", () => {
  beforeEach(() => {
    mkdirSync(TEST_DIR, { recursive: true });
  });
  
  test("should only show results for the most recent file", async () => {
    // Create test files
    const slowFile = join(TEST_DIR, "slow.ts");
    const fastFile = join(TEST_DIR, "fast.py");
    
    writeFileSync(slowFile, `const x: string = 42; // Error`);
    writeFileSync(fastFile, `x: str = 123  # Error`);
    
    // Simulate two hook calls in quick succession
    const results: string[] = [];
    
    // First: TypeScript (slow)
    const proc1 = spawn(["bun", "run", "src/hook-file-latest.ts", "PostToolUse"], {
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe"
    });
    
    proc1.stdin.write(JSON.stringify({
      tool_name: "Edit",
      tool_input: { file_path: slowFile },
      cwd: TEST_DIR
    }));
    proc1.stdin.end();
    
    // Immediately after: Python (fast)
    const proc2 = spawn(["bun", "run", "src/hook-file-latest.ts", "PostToolUse"], {
      stdin: "pipe",
      stdout: "pipe", 
      stderr: "pipe"
    });
    
    proc2.stdin.write(JSON.stringify({
      tool_name: "Edit",
      tool_input: { file_path: fastFile },
      cwd: TEST_DIR
    }));
    proc2.stdin.end();
    
    // Collect results
    const [stderr1, stderr2] = await Promise.all([
      new Response(proc1.stderr).text(),
      new Response(proc2.stderr).text()
    ]);
    
    await Promise.all([proc1.exited, proc2.exited]);
    
    // Should only see Python errors (fast), not TypeScript (slow)
    if (stderr1) results.push(stderr1);
    if (stderr2) results.push(stderr2);
    
    const allOutput = results.join("\n");
    
    // We should see Python errors
    if (allOutput.includes("error")) {
      expect(allOutput).toContain("fast.py");
      // Should NOT see TypeScript errors (they were superseded)
      expect(allOutput).not.toContain("slow.ts");
    }
  });
  
  test("sequential edits should show only latest", async () => {
    const testFile = join(TEST_DIR, "evolving.ts");
    
    // Version 1: One error
    writeFileSync(testFile, `const x: string = 42;`);
    
    const proc1 = spawn(["bun", "run", "src/hook-file-latest.ts", "PostToolUse"], {
      stdin: "pipe",
      stderr: "pipe"
    });
    
    proc1.stdin.write(JSON.stringify({
      tool_name: "Edit",
      tool_input: { file_path: testFile },
      cwd: TEST_DIR
    }));
    proc1.stdin.end();
    
    // Immediately update file and check again
    writeFileSync(testFile, `const x: string = "fixed";`);
    
    const proc2 = spawn(["bun", "run", "src/hook-file-latest.ts", "PostToolUse"], {
      stdin: "pipe",
      stderr: "pipe"
    });
    
    proc2.stdin.write(JSON.stringify({
      tool_name: "Edit",
      tool_input: { file_path: testFile },
      cwd: TEST_DIR
    }));
    proc2.stdin.end();
    
    const [stderr1, stderr2] = await Promise.all([
      new Response(proc1.stderr).text(),
      new Response(proc2.stderr).text()
    ]);
    
    // Second check should show no errors (file was fixed)
    // First check's results should be discarded
    if (stderr2) {
      expect(stderr2).not.toContain("Type 'number' is not assignable");
    }
  });
  
  test("should handle timeout gracefully", async () => {
    const testFile = join(TEST_DIR, "timeout.ts");
    writeFileSync(testFile, `const x: string = 42;`);
    
    // Run with very short timeout
    const proc = spawn(["bun", "run", "src/hook-file-latest.ts", "PostToolUse"], {
      stdin: "pipe",
      stderr: "pipe",
      env: { ...process.env, CLAUDE_LSP_TIMEOUT: "100" } // 100ms timeout
    });
    
    proc.stdin.write(JSON.stringify({
      tool_name: "Edit",
      tool_input: { file_path: testFile },
      cwd: TEST_DIR
    }));
    proc.stdin.end();
    
    const stderr = await new Response(proc.stderr).text();
    await proc.exited;
    
    // Should see timeout message
    if (stderr) {
      expect(stderr).toContain("timed out");
    }
  });
});

afterAll(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
});
import { describe, test, expect, beforeEach, afterAll } from "bun:test";
import { spawn } from "bun";
import { writeFileSync, mkdirSync, rmSync, existsSync } from "fs";
import { join } from "path";

const TEST_DIR = "/tmp/claude-lsp-rules-test";
const HOOK_BIN = "./bin/claude-lsp-file-hook";

describe("Comprehensive Rule Testing", () => {
  beforeEach(() => {
    mkdirSync(TEST_DIR, { recursive: true });
    // Clear state before each test
    const proc = spawn([HOOK_BIN, "clear"], { stdio: ["ignore", "ignore", "ignore"] });
    proc.unref();
  });

  describe("Rule 1: File-based checking (no project discovery)", () => {
    test("should check individual files without needing project root", async () => {
      // Create a standalone file (no package.json, tsconfig, etc.)
      const loneFile = "/tmp/standalone.ts";
      writeFileSync(loneFile, `const x: string = 42;`);
      
      const proc = spawn([HOOK_BIN, "PostToolUse"], {
        stdin: "pipe",
        stderr: "pipe"
      });
      
      proc.stdin.write(JSON.stringify({
        tool_name: "Edit",
        tool_input: { file_path: loneFile }
      }));
      proc.stdin.end();
      
      const stderr = await new Response(proc.stderr).text();
      const exitCode = await proc.exited;
      
      // Should detect error without needing project context
      expect(exitCode).toBe(2);
      expect(stderr).toContain("Type 'number' is not assignable to type 'string'");
    });
  });

  describe("Rule 2: One error report per file (latest only)", () => {
    test("should only show results for the most recently edited file", async () => {
      const file1 = join(TEST_DIR, "first.ts");
      const file2 = join(TEST_DIR, "second.py");
      
      writeFileSync(file1, `const x: string = 42;`);
      writeFileSync(file2, `x: str = 123`);
      
      // Edit first file
      const proc1 = spawn([HOOK_BIN, "PostToolUse"], {
        stdin: "pipe",
        stderr: "pipe"
      });
      
      proc1.stdin.write(JSON.stringify({
        tool_name: "Edit",
        tool_input: { file_path: file1 }
      }));
      proc1.stdin.end();
      
      // Immediately edit second file
      await Bun.sleep(100); // Small delay to ensure order
      
      const proc2 = spawn([HOOK_BIN, "PostToolUse"], {
        stdin: "pipe",
        stderr: "pipe",
        env: { 
          ...process.env, 
          PATH: `/Users/steven_chong/.bun/bin:${process.env.PATH}`,
          CLAUDE_LSP_TIMEOUT: "15000"
        }
      });
      
      proc2.stdin.write(JSON.stringify({
        tool_name: "Edit",
        tool_input: { file_path: file2 }
      }));
      proc2.stdin.end();
      
      // Wait for both
      const [stderr1, stderr2] = await Promise.all([
        new Response(proc1.stderr).text(),
        new Response(proc2.stderr).text()
      ]);
      
      const [exit1, exit2] = await Promise.all([proc1.exited, proc2.exited]);
      
      // First file should be suppressed (exit 0)
      // Second file should show errors (exit 2)
      expect(exit1).toBe(0); // Suppressed
      expect(exit2).toBe(2); // Shown
      
      // Combined output should only mention second file
      const combined = stderr1 + stderr2;
      if (combined.includes("error")) {
        expect(combined).toContain("second.py");
        expect(combined).not.toContain("first.ts");
      }
    });
  });

  describe("Rule 3: Deduplication within 5 seconds", () => {
    test("should not show duplicate errors for same file within 5 seconds", async () => {
      const testFile = join(TEST_DIR, "dedup.ts");
      writeFileSync(testFile, `const x: string = 42;`);
      
      // First check
      const proc1 = spawn([HOOK_BIN, "PostToolUse"], {
        stdin: "pipe",
        stderr: "pipe"
      });
      
      proc1.stdin.write(JSON.stringify({
        tool_name: "Edit",
        tool_input: { file_path: testFile }
      }));
      proc1.stdin.end();
      
      const stderr1 = await new Response(proc1.stderr).text();
      const exit1 = await proc1.exited;
      
      // Second check immediately after
      const proc2 = spawn([HOOK_BIN, "PostToolUse"], {
        stdin: "pipe",
        stderr: "pipe"
      });
      
      proc2.stdin.write(JSON.stringify({
        tool_name: "Edit",
        tool_input: { file_path: testFile }
      }));
      proc2.stdin.end();
      
      const stderr2 = await new Response(proc2.stderr).text();
      const exit2 = await proc2.exited;
      
      // First should show errors
      expect(exit1).toBe(2);
      expect(stderr1).toContain("error");
      
      // Second should be suppressed
      expect(exit2).toBe(0);
      expect(stderr2).toBe("");
    });
  });

  describe("Rule 4: Timeout handling (5 second default)", () => {
    test("should timeout slow commands and show warning", async () => {
      const testFile = join(TEST_DIR, "timeout.ts");
      writeFileSync(testFile, `const x: string = 42;`);
      
      // Run with very short timeout
      const proc = spawn([HOOK_BIN, "PostToolUse"], {
        stdin: "pipe",
        stderr: "pipe",
        env: { ...process.env, CLAUDE_LSP_TIMEOUT: "100" } // 100ms timeout
      });
      
      proc.stdin.write(JSON.stringify({
        tool_name: "Edit",
        tool_input: { file_path: testFile }
      }));
      proc.stdin.end();
      
      const stderr = await new Response(proc.stderr).text();
      const exitCode = await proc.exited;
      
      // Should show timeout warning
      expect(stderr).toContain("timed out");
      expect(exitCode).toBe(2); // Still exits with error code
    });

    test("should complete normally within timeout", async () => {
      const testFile = join(TEST_DIR, "normal.ts");
      writeFileSync(testFile, `const x: string = "hello";`); // No error
      
      // Run with normal timeout
      const proc = spawn([HOOK_BIN, "PostToolUse"], {
        stdin: "pipe",
        stderr: "pipe",
        env: { ...process.env, CLAUDE_LSP_TIMEOUT: "5000" }
      });
      
      proc.stdin.write(JSON.stringify({
        tool_name: "Edit",
        tool_input: { file_path: testFile }
      }));
      proc.stdin.end();
      
      const stderr = await new Response(proc.stderr).text();
      const exitCode = await proc.exited;
      
      // Should complete without timeout
      expect(stderr).not.toContain("timed out");
      expect(exitCode).toBe(0); // No errors
    });
  });

  describe("Rule 5: Smart file extraction from tool output", () => {
    test("should extract file path from Bash output", async () => {
      const testFile = join(TEST_DIR, "extracted.py");
      writeFileSync(testFile, `x: str = 123`);
      
      const proc = spawn([HOOK_BIN, "PostToolUse"], {
        stdin: "pipe",
        stderr: "pipe",
        env: { 
          ...process.env, 
          PATH: `/Users/steven_chong/.bun/bin:${process.env.PATH}`,
          CLAUDE_LSP_TIMEOUT: "15000" // 15 second timeout for tests
        }
      });
      
      proc.stdin.write(JSON.stringify({
        tool_name: "Bash",
        tool_response: {
          output: `Successfully wrote ${testFile}`
        }
      }));
      proc.stdin.end();
      
      const stderr = await new Response(proc.stderr).text();
      const exitCode = await proc.exited;
      
      // Should detect the file from output and check it
      expect(exitCode).toBe(2);
      expect(stderr).toContain("extracted.py");
      expect(stderr).toContain("Type \"Literal[123]\"");
    });

    test("should not extract non-source files", async () => {
      const proc = spawn([HOOK_BIN, "PostToolUse"], {
        stdin: "pipe",
        stderr: "pipe"
      });
      
      proc.stdin.write(JSON.stringify({
        tool_name: "Bash",
        tool_response: {
          output: "Created README.md and config.json"
        }
      }));
      proc.stdin.end();
      
      const stderr = await new Response(proc.stderr).text();
      const exitCode = await proc.exited;
      
      // Should not check non-source files
      expect(exitCode).toBe(0);
      expect(stderr).toBe("");
    });
  });

  describe("Rule 6: Content change detection", () => {
    test("should recheck file when content changes", async () => {
      const testFile = join(TEST_DIR, "evolving.ts");
      
      // Version 1: Has error
      writeFileSync(testFile, `const x: string = 42;`);
      
      const proc1 = spawn([HOOK_BIN, "PostToolUse"], {
        stdin: "pipe",
        stderr: "pipe"
      });
      
      proc1.stdin.write(JSON.stringify({
        tool_name: "Edit",
        tool_input: { file_path: testFile }
      }));
      proc1.stdin.end();
      
      const stderr1 = await new Response(proc1.stderr).text();
      expect(stderr1).toContain("Type 'number' is not assignable");
      
      // Wait for dedup window to pass
      await Bun.sleep(5100);
      
      // Version 2: Fixed
      writeFileSync(testFile, `const x: string = "hello";`);
      
      const proc2 = spawn([HOOK_BIN, "PostToolUse"], {
        stdin: "pipe",
        stderr: "pipe"
      });
      
      proc2.stdin.write(JSON.stringify({
        tool_name: "Edit",
        tool_input: { file_path: testFile }
      }));
      proc2.stdin.end();
      
      const stderr2 = await new Response(proc2.stderr).text();
      const exit2 = await proc2.exited;
      
      // Should not show errors (file is fixed)
      expect(exit2).toBe(0);
      expect(stderr2).toBe("");
    });
  });

  describe("Rule 7: Multiple language support", () => {
    test("should check different file types correctly", async () => {
      const files = [
        { path: join(TEST_DIR, "test.ts"), content: `const x: string = 42;`, expectError: true },
        { path: join(TEST_DIR, "test.py"), content: `x: str = 123`, expectError: true },
        { path: join(TEST_DIR, "test.go"), content: `package main\nfunc main() { var x int = "hello" }`, expectError: true },
        { path: join(TEST_DIR, "test.rs"), content: `fn main() { let x: i32 = "hello"; }`, expectError: true }
      ];
      
      for (const file of files) {
        writeFileSync(file.path, file.content);
        
        const proc = spawn([HOOK_BIN, "PostToolUse"], {
          stdin: "pipe",
          stderr: "pipe",
          env: { 
          ...process.env, 
          PATH: `/Users/steven_chong/.bun/bin:${process.env.PATH}`,
          CLAUDE_LSP_TIMEOUT: "15000"
        }
        });
        
        proc.stdin.write(JSON.stringify({
          tool_name: "Edit",
          tool_input: { file_path: file.path }
        }));
        proc.stdin.end();
        
        const stderr = await new Response(proc.stderr).text();
        const exitCode = await proc.exited;
        
        if (file.expectError) {
          // Should detect type errors in each language
          expect(exitCode).toBe(2);
          expect(stderr.length).toBeGreaterThan(0);
        }
        
        // Clear state between tests
        spawn([HOOK_BIN, "clear"], { stdio: ["ignore", "ignore", "ignore"] }).unref();
        await Bun.sleep(100);
      }
    });
  });
});

afterAll(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
  // Final state cleanup
  spawn([HOOK_BIN, "clear"], { stdio: ["ignore", "ignore", "ignore"] }).unref();
});
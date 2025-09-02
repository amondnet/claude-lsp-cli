import { describe, test, expect } from "bun:test";
import { spawn } from "bun";
import { existsSync } from "fs";
import { join } from "path";

const HOOK_BIN = "./bin/claude-lsp-file-hook";
const EXAMPLES_DIR = "./examples";

// Language-specific test files and expected error patterns
const LANGUAGE_TESTS = [
  {
    project: "typescript-project",
    file: "src/index.ts",
    expectedPattern: /Type '(number|string|boolean)' is not assignable to type/,
    requiresInstall: false
  },
  {
    project: "python-project",
    file: "main.py",
    expectedPattern: /Type "str \| int" is not assignable to declared type "str"/,
    requiresInstall: true // Requires pyright
  },
  {
    project: "go-project",
    file: "main.go",
    expectedPattern: /cannot use .* \(.*type .*\) as .*type .* in/,
    requiresInstall: true // Requires gopls
  },
  {
    project: "java-project",
    file: "src/main/java/com/example/Main.java",
    expectedPattern: /incompatible types|cannot find symbol/,
    requiresInstall: true // Requires jdtls
  },
  {
    project: "rust-project",
    file: "src/main.rs",
    expectedPattern: /mismatched types|cannot find/,
    requiresInstall: true // Requires rust-analyzer
  },
  {
    project: "php-project",
    file: "index.php",
    expectedPattern: /Undefined variable|syntax error/,
    requiresInstall: true // Requires intelephense
  },
  {
    project: "cpp-project",
    file: "main.cpp",
    expectedPattern: /error:|undeclared identifier/,
    requiresInstall: true // Requires clangd
  }
];

describe("Example Project Error Detection", () => {
  // Check if hook binary exists
  test("hook binary should exist", () => {
    expect(existsSync(HOOK_BIN)).toBe(true);
  });

  // Test each language
  for (const lang of LANGUAGE_TESTS) {
    const projectPath = join(EXAMPLES_DIR, lang.project);
    const filePath = join(projectPath, lang.file);
    
    // Skip if project doesn't exist
    if (!existsSync(projectPath)) {
      test.skip(`${lang.project} - project not found`, () => {});
      continue;
    }
    
    // Skip if file doesn't exist
    if (!existsSync(filePath)) {
      test.skip(`${lang.project} - ${lang.file} not found`, () => {});
      continue;
    }

    test(`${lang.project} should detect errors in ${lang.file}`, async () => {
      const proc = spawn([HOOK_BIN, "PostToolUse"], {
        stdin: "pipe",
        stderr: "pipe",
        env: { 
          ...process.env, 
          PATH: `/Users/steven_chong/.bun/bin:${process.env.PATH}`,
          CLAUDE_LSP_TIMEOUT: "10000" // 10 second timeout for slower checkers
        }
      });
      
      // Send hook data for file edit
      proc.stdin.write(JSON.stringify({
        tool_name: "Edit",
        tool_input: { 
          file_path: filePath
        }
      }));
      proc.stdin.end();
      
      const stderr = await new Response(proc.stderr).text();
      const exitCode = await proc.exited;
      
      // Check if language tool is installed
      if (stderr.includes("not installed") || stderr.includes("not found")) {
        if (lang.requiresInstall) {
          console.log(`⚠️  ${lang.project}: Language tool not installed, skipping error detection test`);
          expect(exitCode).toBe(0); // No errors if tool not installed
          return;
        }
      }
      
      // Should have exit code 2 (errors found) for files with errors
      expect(exitCode).toBe(2);
      
      // Should contain expected error pattern
      expect(stderr).toMatch(lang.expectedPattern);
      
      // Should mention the file name
      expect(stderr).toContain(lang.file.split('/').pop());
      
      // Should have proper system message format
      expect(stderr).toContain("[[system-message]]:");
    }, 15000); // 15 second timeout per test
  }

  test("should handle non-existent files gracefully", async () => {
    const proc = spawn([HOOK_BIN, "PostToolUse"], {
      stdin: "pipe", 
      stderr: "pipe",
      env: { ...process.env, PATH: `/Users/steven_chong/.bun/bin:${process.env.PATH}` }
    });
    
    proc.stdin.write(JSON.stringify({
      tool_name: "Edit",
      tool_input: { file_path: "/tmp/does-not-exist.ts" }
    }));
    proc.stdin.end();
    
    const stderr = await new Response(proc.stderr).text();
    const exitCode = await proc.exited;
    
    // Should exit cleanly without errors
    expect(exitCode).toBe(0);
    expect(stderr).toBe("");
  });

  test("should handle files without extensions", async () => {
    const proc = spawn([HOOK_BIN, "PostToolUse"], {
      stdin: "pipe",
      stderr: "pipe"
    });
    
    proc.stdin.write(JSON.stringify({
      tool_name: "Edit",
      tool_input: { file_path: "/tmp/README" }
    }));
    proc.stdin.end();
    
    const stderr = await new Response(proc.stderr).text();
    const exitCode = await proc.exited;
    
    // Should exit cleanly without checking
    expect(exitCode).toBe(0);
    expect(stderr).toBe("");
  });
});
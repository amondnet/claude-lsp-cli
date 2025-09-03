import { describe, test, expect } from "bun:test";
import { spawn } from "child_process";
import { join } from "path";

const CLI_PATH = join(__dirname, "..", "bin", "claude-lsp-cli");
const EXAMPLES_DIR = join(__dirname, "..", "examples");

// Helper to run CLI and capture output
async function runCLI(args: string[]): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve) => {
    const proc = spawn(CLI_PATH, args);
    let stdout = "";
    let stderr = "";
    
    proc.stdout.on("data", (data) => { stdout += data.toString(); });
    proc.stderr.on("data", (data) => { stderr += data.toString(); });
    
    proc.on("close", (exitCode) => {
      resolve({ stdout, stderr, exitCode: exitCode || 0 });
    });
  });
}

describe("CLI Diagnostics Command", () => {
  // Test diagnostics mode behavior:
  // - Exit code 0 (success) regardless of diagnostics found
  // - Outputs "[[system-message]]:" prefix
  // - Shows summary even when no errors
  
  test("Bun/TypeScript with no errors - shows 'no errors or warnings'", async () => {
    const result = await runCLI(["diagnostics", join(__dirname, "..", "src", "cli.ts")]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("[[system-message]]:");
    expect(result.stdout).toContain('"summary":"no errors or warnings"');
  }, 30000);

  test("C++ with errors - shows diagnostic count", async () => {
    const result = await runCLI(["diagnostics", join(EXAMPLES_DIR, "cpp-project", "src", "main.cpp")]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("[[system-message]]:");
    expect(result.stdout).toContain('"diagnostics":[');
    expect(result.stdout).toContain('error');
  }, 30000);

  test("Elixir with compilation errors", async () => {
    const result = await runCLI(["diagnostics", join(EXAMPLES_DIR, "elixir-project", "lib", "main.ex")]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("[[system-message]]:");
    expect(result.stdout).toContain('"diagnostics":[');
    const match = result.stdout.match(/"summary":"(\d+) error/);
    expect(match).toBeTruthy();
    if (match) {
      const errorCount = parseInt(match[1]);
      expect(errorCount).toBeGreaterThan(0);
    }
  }, 30000);

  test("Go with multiple errors", async () => {
    const result = await runCLI(["diagnostics", join(EXAMPLES_DIR, "go-project", "cmd", "server", "main.go")]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("[[system-message]]:");
    expect(result.stdout).toContain('"diagnostics":[');
    expect(result.stdout).toContain('error');
  }, 30000);

  test("Java with multiple errors", async () => {
    const result = await runCLI(["diagnostics", join(EXAMPLES_DIR, "java-project", "src", "main", "java", "com", "example", "Main.java")]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("[[system-message]]:");
    expect(result.stdout).toContain('"diagnostics":[');
    expect(result.stdout).toContain('error');
  }, 30000);

  test("Lua with syntax errors", async () => {
    const result = await runCLI(["diagnostics", join(EXAMPLES_DIR, "lua-project", "main.lua")]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("[[system-message]]:");
    expect(result.stdout).toContain('"diagnostics":[');
    expect(result.stdout).toContain('error');
  }, 30000);

  test("PHP with syntax errors", async () => {
    const result = await runCLI(["diagnostics", join(EXAMPLES_DIR, "php-project", "src", "User.php")]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("[[system-message]]:");
    expect(result.stdout).toContain('"diagnostics":[');
    expect(result.stdout).toContain('error');
  }, 30000);

  test("Python with type errors", async () => {
    const result = await runCLI(["diagnostics", join(EXAMPLES_DIR, "python-project", "main.py")]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("[[system-message]]:");
    expect(result.stdout).toContain('"diagnostics":[');
    const hasErrors = result.stdout.includes('"severity":"error"');
    const hasWarnings = result.stdout.includes('"severity":"warning"');
    expect(hasErrors || hasWarnings).toBe(true);
  }, 30000);

  test("Rust with compilation errors", async () => {
    const result = await runCLI(["diagnostics", join(EXAMPLES_DIR, "rust-project", "src", "main.rs")]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("[[system-message]]:");
    expect(result.stdout).toContain('"diagnostics":[');
    expect(result.stdout).toContain('error');
  }, 30000);

  test("Scala with 9 errors", async () => {
    const result = await runCLI(["diagnostics", join(EXAMPLES_DIR, "scala-project", "src", "main", "scala", "Main.scala")]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("[[system-message]]:");
    expect(result.stdout).toContain('"diagnostics":[');
    const match = result.stdout.match(/"summary":"(\d+) error/);
    expect(match).toBeTruthy();
    if (match) {
      const errorCount = parseInt(match[1]);
      expect(errorCount).toBe(9);
    }
  }, 30000);

  test("Terraform with warnings", async () => {
    const result = await runCLI(["diagnostics", join(EXAMPLES_DIR, "terraform-project", "main.tf")]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("[[system-message]]:");
    // Terraform might have warnings but not necessarily errors
    const hasWarnings = result.stdout.includes('"severity":"warning"');
    expect(hasWarnings).toBe(true);
  }, 30000);

  test("TypeScript with multiple errors", async () => {
    const result = await runCLI(["diagnostics", join(EXAMPLES_DIR, "typescript-project", "src", "index.ts")]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("[[system-message]]:");
    expect(result.stdout).toContain('"diagnostics":[');
    expect(result.stdout).toContain('error');
  }, 30000);

  test("Non-existent file returns exit code 1", async () => {
    const result = await runCLI(["diagnostics", "/tmp/non-existent-file.ts"]);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("File not found");
  }, 10000);
});

describe("CLI Hook Mode", () => {
  // Test hook mode behavior:
  // - Exit code 2 when diagnostics found
  // - Exit code 0 when no diagnostics
  // - No output when no diagnostics
  // - Output with "[[system-message]]:" when diagnostics found
  
  test("Hook mode with diagnostics returns exit code 2", async () => {
    const hookData = JSON.stringify({
      tool_name: "Edit",
      tool_input: {
        file_path: join(EXAMPLES_DIR, "typescript-project", "src", "index.ts")
      }
    });
    
    const proc = spawn(CLI_PATH, ["hook", "PostToolUse"]);
    proc.stdin.write(hookData);
    proc.stdin.end();
    
    const result = await new Promise<{ stdout: string; stderr: string; exitCode: number }>((resolve) => {
      let stdout = "";
      let stderr = "";
      
      proc.stdout.on("data", (data) => { stdout += data.toString(); });
      proc.stderr.on("data", (data) => { stderr += data.toString(); });
      
      proc.on("close", (exitCode) => {
        resolve({ stdout, stderr, exitCode: exitCode || 0 });
      });
    });
    
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("[[system-message]]:");
    expect(result.stderr).toContain('"diagnostics":[');
  }, 30000);

  test("Hook mode with no diagnostics returns exit code 0 and no output", async () => {
    const hookData = JSON.stringify({
      tool_name: "Edit",
      tool_input: {
        file_path: join(__dirname, "..", "src", "cli.ts")
      }
    });
    
    const proc = spawn(CLI_PATH, ["hook", "PostToolUse"]);
    proc.stdin.write(hookData);
    proc.stdin.end();
    
    const result = await new Promise<{ stdout: string; stderr: string; exitCode: number }>((resolve) => {
      let stdout = "";
      let stderr = "";
      
      proc.stdout.on("data", (data) => { stdout += data.toString(); });
      proc.stderr.on("data", (data) => { stderr += data.toString(); });
      
      proc.on("close", (exitCode) => {
        resolve({ stdout, stderr, exitCode: exitCode || 0 });
      });
    });
    
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe(""); // No output when no diagnostics
  }, 30000);

  test("Hook mode with non-code tool returns exit code 0", async () => {
    const hookData = JSON.stringify({
      tool_name: "Bash",
      tool_input: {
        command: "ls -la"
      }
    });
    
    const proc = spawn(CLI_PATH, ["hook", "PostToolUse"]);
    proc.stdin.write(hookData);
    proc.stdin.end();
    
    const result = await new Promise<{ stdout: string; stderr: string; exitCode: number }>((resolve) => {
      let stdout = "";
      let stderr = "";
      
      proc.stdout.on("data", (data) => { stdout += data.toString(); });
      proc.stderr.on("data", (data) => { stderr += data.toString(); });
      
      proc.on("close", (exitCode) => {
        resolve({ stdout, stderr, exitCode: exitCode || 0 });
      });
    });
    
    expect(result.exitCode).toBe(0);
  }, 10000);
});
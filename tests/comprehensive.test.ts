import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { spawn } from "bun";
import { execSync } from "child_process";
import { join } from "path";
import { mkdirSync, writeFileSync, existsSync, rmSync } from "fs";
import { tmpdir } from "os";

const projectRoot = process.cwd();
const TEST_PROJECT = join(tmpdir(), "claude-lsp-comprehensive-test");

// Setup test project
async function setupTestProject() {
  // Clean up any existing test project
  if (existsSync(TEST_PROJECT)) {
    rmSync(TEST_PROJECT, { recursive: true });
  }
  
  mkdirSync(TEST_PROJECT, { recursive: true });
  
  // Create package.json
  writeFileSync(join(TEST_PROJECT, "package.json"), JSON.stringify({
    name: "test-project",
    version: "1.0.0",
    devDependencies: {
      "typescript": "^5.0.0"
    }
  }, null, 2));
  
  // Create tsconfig.json
  writeFileSync(join(TEST_PROJECT, "tsconfig.json"), JSON.stringify({
    compilerOptions: {
      target: "ES2022",
      module: "ESNext",
      strict: true,
      skipLibCheck: true
    }
  }, null, 2));
  
  // Install TypeScript in the test project
  console.log("Installing TypeScript in test project...");
  execSync("bun install", { cwd: TEST_PROJECT, stdio: "inherit" });
  
  // Create test file with errors
  writeFileSync(join(TEST_PROJECT, "test.ts"), `
// This file has intentional errors for testing
const message: string = 123; // Type error
console.log(mesage); // Typo error

function add(a: number, b: number): number {
  return a + b;
}

add("1", "2"); // Type error
`);
  
  // Create good file without errors  
  writeFileSync(join(TEST_PROJECT, "good.ts"), `
// This file has no errors
const message: string = "hello";
console.log(message);

function add(a: number, b: number): number {
  return a + b;
}

add(1, 2);
`);
}

describe("Comprehensive LSP Tests", () => {
  beforeAll(async () => {
    await setupTestProject();
  });
  
  afterAll(() => {
    if (existsSync(TEST_PROJECT)) {
      rmSync(TEST_PROJECT, { recursive: true });
    }
  });

  describe("2. CLI Hook Mode Tests", () => {
    test("PostToolUse with errors returns exit code 2", async () => {
      const hookData = {
        session_id: "test-session",
        transcript_path: "/tmp/test-transcript", 
        cwd: TEST_PROJECT,
        hook_event_name: "PostToolUse",
        tool_name: "Edit",
        tool_input: { file_path: join(TEST_PROJECT, "test.ts") },
        tool_response: { success: true }
      };
      
      const proc = Bun.spawn(["bun", "run", join(projectRoot, "src/cli.ts"), "hook", "PostToolUse"], {
        cwd: TEST_PROJECT, // Run from the test project directory
        stdin: "pipe",
        stdout: "pipe", 
        stderr: "pipe",
        env: { ...process.env, CLAUDE_LSP_HOOK_MODE: 'true' }
      });
      
      // Send hook data via stdin
      proc.stdin.write(JSON.stringify(hookData));
      proc.stdin.end();
      
      // Wait for completion and get output
      const exitCode = await proc.exited;
      const stdout = await new Response(proc.stdout).text();
      const stderr = await new Response(proc.stderr).text();
      
      const result = { stdout, stderr, code: exitCode };
      
      // Debug output
      console.log("Exit code:", result.code);
      console.log("Stderr length:", result.stderr.length);
      console.log("First 500 chars of stderr:", JSON.stringify(result.stderr.substring(0, 500)));
      
      // The CLI should find errors and output system message
      expect(result.code).toBe(2); // Should exit 2 when errors found
      expect(result.stderr).toContain("[[system-message]]:");
    }, 30000);
    
    test("PostToolUse without errors returns exit code 0", async () => {
      // Create a clean project with no errors
      const CLEAN_PROJECT = "/tmp/claude-lsp-clean-test";
      if (existsSync(CLEAN_PROJECT)) {
        rmSync(CLEAN_PROJECT, { recursive: true });
      }
      mkdirSync(CLEAN_PROJECT, { recursive: true });
      
      // Create a simple valid TypeScript file
      writeFileSync(join(CLEAN_PROJECT, "good.ts"), `
const message: string = "Hello World";
console.log(message);
`);
      
      const hookData = {
        session_id: "test-session", 
        transcript_path: "/tmp/test-transcript",
        cwd: CLEAN_PROJECT,
        hook_event_name: "PostToolUse",
        tool_name: "Edit", 
        tool_input: { file_path: join(CLEAN_PROJECT, "good.ts") },
        tool_response: { success: true }
      };
      
      const proc = Bun.spawn(["bun", "run", join(projectRoot, "src/cli.ts"), "hook", "PostToolUse"], {
        cwd: CLEAN_PROJECT, // Run from the clean project directory
        stdin: "pipe",
        stdout: "pipe",
        stderr: "pipe",
        env: { ...process.env, CLAUDE_LSP_HOOK_MODE: 'true' }
      });
      
      // Send hook data via stdin
      proc.stdin.write(JSON.stringify(hookData));
      proc.stdin.end();
      
      // Wait for completion and get output
      const exitCode = await proc.exited;
      const stdout = await new Response(proc.stdout).text();
      const stderr = await new Response(proc.stderr).text();
      
      const result = { stdout, stderr, code: exitCode };
      
      // Clean up
      if (existsSync(CLEAN_PROJECT)) {
        rmSync(CLEAN_PROJECT, { recursive: true });
      }
      
      // Should exit with code 0 for no errors
      expect(result.code).toBe(0);
      
      // Should NOT output error diagnostics
      if (result.stderr.includes("[[system-message]]")) {
        expect(result.stderr).toContain("all_clear");
      }
    }, 30000);

    test("SessionStart event processes correctly", async () => {
      const hookData = {
        session_id: "test-session",
        transcript_path: "/tmp/test-transcript",
        cwd: TEST_PROJECT,
        hook_event_name: "SessionStart"
      };
      
      const result = await new Promise<{stdout: string, stderr: string, code: number}>((resolve) => {
        const proc = spawn(["bun", "run", join(projectRoot, "src/cli.ts"), "hook", "SessionStart"], {
          cwd: projectRoot,
          stdin: "pipe",
          stdout: "pipe", 
          stderr: "pipe",
          env: { ...process.env, CLAUDE_LSP_HOOK_MODE: 'true' }
        });
        
        // Send hook data via stdin
        proc.stdin?.write(JSON.stringify(hookData));
        proc.stdin?.end();
        
        proc.exited.then(() => {
          const stdout = proc.stdout ? new Response(proc.stdout).text() : Promise.resolve("");
          const stderr = proc.stderr ? new Response(proc.stderr).text() : Promise.resolve("");
          
          Promise.all([stdout, stderr]).then(([stdoutText, stderrText]) => {
            resolve({ stdout: stdoutText, stderr: stderrText, code: proc.exitCode || 0 });
          });
        });
      });
      
      // SessionStart should always return 0
      expect(result.code).toBe(0);
    }, 30000);

    test("Stop event processes correctly", async () => {
      const hookData = {
        session_id: "test-session", 
        transcript_path: "/tmp/test-transcript",
        cwd: TEST_PROJECT,
        hook_event_name: "Stop"
      };
      
      const result = await new Promise<{stdout: string, stderr: string, code: number}>((resolve) => {
        const proc = spawn(["bun", "run", join(projectRoot, "src/cli.ts"), "hook", "Stop"], {
          cwd: projectRoot,
          stdin: "pipe",
          stdout: "pipe",
          stderr: "pipe", 
          env: { ...process.env, CLAUDE_LSP_HOOK_MODE: 'true' }
        });
        
        // Send hook data via stdin
        proc.stdin?.write(JSON.stringify(hookData));
        proc.stdin?.end();
        
        proc.exited.then(() => {
          const stdout = proc.stdout ? new Response(proc.stdout).text() : Promise.resolve("");
          const stderr = proc.stderr ? new Response(proc.stderr).text() : Promise.resolve("");
          
          Promise.all([stdout, stderr]).then(([stdoutText, stderrText]) => {
            resolve({ stdout: stdoutText, stderr: stderrText, code: proc.exitCode || 0 });
          });
        });
      });
      
      // Stop should always return 0
      expect(result.code).toBe(0);
    }, 30000);
  });
});
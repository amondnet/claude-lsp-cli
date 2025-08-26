import { describe, test, expect, beforeAll } from "bun:test";
import { spawn } from "bun";
import { join } from "path";
import { execSync } from "child_process";

const projectRoot = process.cwd();
const EXAMPLE_PROJECT = join(projectRoot, "examples/typescript-project");

describe("Example Project Tests", () => {
  beforeAll(() => {
    // Install dependencies in the example project
    console.log("Installing dependencies in example project...");
    execSync("bun install", { cwd: EXAMPLE_PROJECT, stdio: "inherit" });
  });

  test("TypeScript example project has errors detected", async () => {
    // Create hook data for the example project
    const hookData = {
      session_id: "test-example",
      transcript_path: "/tmp/test-transcript",
      cwd: EXAMPLE_PROJECT,
      hook_event_name: "PostToolUse",
      tool_name: "Edit",
      tool_input: { file_path: join(EXAMPLE_PROJECT, "src/index.ts") },
      tool_response: { success: true }
    };
    
    // In CI, the TypeScript server might need multiple attempts
    let result: {stdout: string, stderr: string, code: number} | undefined;
    let attempts = 0;
    const maxAttempts = process.env.CI ? 3 : 1;
    
    while (attempts < maxAttempts) {
      attempts++;
      
      result = await new Promise<{stdout: string, stderr: string, code: number}>((resolve) => {
      const proc = spawn(["bun", "run", join(projectRoot, "src/cli.ts"), "hook", "PostToolUse"], {
        cwd: projectRoot,
        stdin: "pipe",
        stdout: "pipe", 
        stderr: "pipe",
        env: { ...process.env, CLAUDE_LSP_HOOK_MODE: 'true' }
      });
      
      // Send hook data via stdin
      proc.stdin?.write(JSON.stringify(hookData));
      proc.stdin?.end();
      
      proc.exited.then(async () => {
        const stdout = proc.stdout ? await new Response(proc.stdout).text() : "";
        const stderr = proc.stderr ? await new Response(proc.stderr).text() : "";
        
        resolve({ stdout, stderr, code: proc.exitCode || 0 });
      });
    });
      
      // If we got errors, break out of retry loop
      if (result.code === 2) {
        break;
      }
      
      // If not the last attempt, wait before retrying
      if (attempts < maxAttempts) {
        console.log(`Attempt ${attempts} failed with code ${result.code}, retrying...`);
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    
    
    // Should exit with code 2 when errors are found
    expect(result!.code).toBe(2);
    
    // Should output system message with diagnostics
    expect(result!.stderr).toContain("[[system-message]]:");
    // New format: should contain diagnostics array and summary
    expect(result!.stderr).toContain("diagnostics");
    
    // Should find specific errors we know are in the file
    // Note: Error message might vary slightly between TypeScript versions
    expect(result!.stderr).toMatch(/Type '(number|3000)' is not assignable to type 'string'/i);
  }, 30000);
});
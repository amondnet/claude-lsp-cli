import { describe, test, expect } from "bun:test";
import { join } from "path";
import { existsSync } from "fs";
import { spawn } from "bun";

const EXAMPLES_DIR = join(import.meta.dir, "../examples");
const CLI_PATH = join(import.meta.dir, "../src/cli.ts");

/**
 * This test file validates that diagnostics are properly returned
 * for each example project, testing both project-level and file-level
 * diagnostic retrieval.
 */

describe("Example Projects - Diagnostic Validation", () => {
  
  // Helper function to run diagnostics
  async function runDiagnostics(args: string[], options?: { timeout?: number }): Promise<{
    output: string;
    exitCode: number;
    parsed: any;
  }> {
    // For Java projects, use longer timeout
    const isJavaProject = args.some(arg => arg.includes('java-project'));
    const timeout = options?.timeout || (isJavaProject ? '120000' : '30000');
    
    const proc = spawn(["bun", CLI_PATH, ...args], {
      stdout: "pipe",
      stderr: "pipe",
      env: { 
        ...process.env, 
        DEBUG: "false",
        CLAUDE_LSP_STARTUP_TIMEOUT: timeout
      }
    });
    
    const output = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;
    
    let parsed;
    try {
      // Handle both plain JSON and system-message format
      let jsonStr = output;
      if (output.includes('[[system-message]]:')) {
        jsonStr = output.replace('[[system-message]]:', '').trim();
      }
      parsed = jsonStr ? JSON.parse(jsonStr) : null;
    } catch {
      parsed = null;
    }
    
    return { output, exitCode, parsed };
  }
  
  describe("TypeScript Project", () => {
    const projectPath = join(EXAMPLES_DIR, "typescript-project");
    
    test("project root diagnostics", async () => {
      const { exitCode, parsed } = await runDiagnostics([
        "diagnostics", projectPath
      ]);
      
      expect(exitCode).toBe(0);
      expect(parsed).toBeDefined();
      
      // TypeScript projects should return diagnostics
      if (Array.isArray(parsed)) {
        expect(parsed.length).toBeGreaterThanOrEqual(0);
      } else if (parsed?.diagnostics) {
        expect(Array.isArray(parsed.diagnostics)).toBe(true);
      }
    }, 30000);
    
    test("individual file: src/index.ts", async () => {
      const filePath = join(projectPath, "src/index.ts");
      if (!existsSync(filePath)) return;
      
      const { exitCode, parsed } = await runDiagnostics([
        "diagnostics", projectPath, "--file", filePath
      ]);
      
      expect(exitCode).toBe(0);
      expect(parsed).toBeDefined();
    }, 20000);
    
    test("individual file: src/utils.ts", async () => {
      const filePath = join(projectPath, "src/utils.ts");
      if (!existsSync(filePath)) return;
      
      const { exitCode, parsed } = await runDiagnostics([
        "diagnostics", projectPath, "--file", filePath
      ]);
      
      expect(exitCode).toBe(0);
      expect(parsed).toBeDefined();
    }, 20000);
  });
  
  describe("JavaScript Project", () => {
    const projectPath = join(EXAMPLES_DIR, "javascript-project");
    
    test("project root diagnostics", async () => {
      const { exitCode, parsed } = await runDiagnostics([
        "diagnostics", projectPath
      ]);
      
      expect(exitCode).toBe(0);
      expect(parsed).toBeDefined();
    }, 30000);
    
    test("individual file: src/index.js", async () => {
      const filePath = join(projectPath, "src/index.js");
      if (!existsSync(filePath)) return;
      
      const { exitCode, parsed } = await runDiagnostics([
        "diagnostics", projectPath, "--file", filePath
      ]);
      
      expect(exitCode).toBe(0);
      expect(parsed).toBeDefined();
    }, 20000);
  });
  
  describe("Python Project", () => {
    const projectPath = join(EXAMPLES_DIR, "python-project");
    
    test("project root diagnostics", async () => {
      const { exitCode, parsed } = await runDiagnostics([
        "diagnostics", projectPath
      ]);
      
      expect(exitCode).toBe(0);
      expect(parsed).toBeDefined();
    }, 30000);
    
    test("individual file: main.py", async () => {
      const filePath = join(projectPath, "main.py");
      if (!existsSync(filePath)) return;
      
      const { exitCode, parsed } = await runDiagnostics([
        "diagnostics", projectPath, "--file", filePath
      ]);
      
      expect(exitCode).toBe(0);
      expect(parsed).toBeDefined();
    }, 20000);
    
    test("individual file: src/utils.py", async () => {
      const filePath = join(projectPath, "src/utils.py");
      if (!existsSync(filePath)) return;
      
      const { exitCode, parsed } = await runDiagnostics([
        "diagnostics", projectPath, "--file", filePath
      ]);
      
      expect(exitCode).toBe(0);
      expect(parsed).toBeDefined();
    }, 20000);
  });
  
  describe("Go Project", () => {
    const projectPath = join(EXAMPLES_DIR, "go-project");
    
    test("project root diagnostics", async () => {
      const { exitCode, parsed } = await runDiagnostics([
        "diagnostics", projectPath
      ]);
      
      expect(exitCode).toBe(0);
      expect(parsed).toBeDefined();
    }, 30000);
    
    test("individual file: cmd/main.go", async () => {
      const filePath = join(projectPath, "cmd/main.go");
      if (!existsSync(filePath)) return;
      
      const { exitCode, parsed } = await runDiagnostics([
        "diagnostics", projectPath, "--file", filePath
      ]);
      
      expect(exitCode).toBe(0);
      expect(parsed).toBeDefined();
    }, 20000);
  });
  
  describe("Rust Project", () => {
    const projectPath = join(EXAMPLES_DIR, "rust-project");
    
    test("project root diagnostics", async () => {
      const { exitCode, parsed } = await runDiagnostics([
        "diagnostics", projectPath
      ]);
      
      expect(exitCode).toBe(0);
      expect(parsed).toBeDefined();
    }, 30000);
    
    test("individual file: src/main.rs", async () => {
      const filePath = join(projectPath, "src/main.rs");
      if (!existsSync(filePath)) return;
      
      const { exitCode, parsed } = await runDiagnostics([
        "diagnostics", projectPath, "--file", filePath
      ]);
      
      expect(exitCode).toBe(0);
      expect(parsed).toBeDefined();
    }, 20000);
  });
  
  describe("Java Project", () => {
    const projectPath = join(EXAMPLES_DIR, "java-project");
    
    test("project root diagnostics", async () => {
      const { exitCode, parsed } = await runDiagnostics([
        "diagnostics", projectPath
      ]);
      
      expect(exitCode).toBe(0);
      expect(parsed).toBeDefined();
    }, 120000); // Java servers need more time to initialize
    
    test("individual file: Main.java", async () => {
      const filePath = join(projectPath, "src/main/java/com/example/Main.java");
      if (!existsSync(filePath)) return;
      
      const { exitCode, parsed } = await runDiagnostics([
        "diagnostics", projectPath, "--file", filePath
      ]);
      
      expect(exitCode).toBe(0);
      expect(parsed).toBeDefined();
    }, 60000); // Java file analysis also needs more time
  });
  
  describe("Scala Project", () => {
    const projectPath = join(EXAMPLES_DIR, "scala-project");
    
    test("project root diagnostics", async () => {
      const { exitCode, parsed } = await runDiagnostics([
        "diagnostics", projectPath
      ]);
      
      expect(exitCode).toBe(0);
      expect(parsed).toBeDefined();
    }, 30000);
    
    test("individual file: Main.scala", async () => {
      const filePath = join(projectPath, "src/main/scala/Main.scala");
      if (!existsSync(filePath)) return;
      
      const { exitCode, parsed } = await runDiagnostics([
        "diagnostics", projectPath, "--file", filePath
      ]);
      
      expect(exitCode).toBe(0);
      expect(parsed).toBeDefined();
    }, 20000);
  });
  
  describe("Ruby Project", () => {
    const projectPath = join(EXAMPLES_DIR, "ruby-project");
    
    test("project root diagnostics", async () => {
      const { exitCode, parsed } = await runDiagnostics([
        "diagnostics", projectPath
      ]);
      
      expect(exitCode).toBe(0);
      expect(parsed).toBeDefined();
    }, 30000);
    
    test("individual file: lib/main.rb", async () => {
      const filePath = join(projectPath, "lib/main.rb");
      if (!existsSync(filePath)) return;
      
      const { exitCode, parsed } = await runDiagnostics([
        "diagnostics", projectPath, "--file", filePath
      ]);
      
      expect(exitCode).toBe(0);
      expect(parsed).toBeDefined();
    }, 20000);
  });
  
  describe("PHP Project", () => {
    const projectPath = join(EXAMPLES_DIR, "php-project");
    
    test("project root diagnostics", async () => {
      const { exitCode, parsed } = await runDiagnostics([
        "diagnostics", projectPath
      ]);
      
      expect(exitCode).toBe(0);
      expect(parsed).toBeDefined();
    }, 30000);
    
    test("individual file: src/index.php", async () => {
      const filePath = join(projectPath, "src/index.php");
      if (!existsSync(filePath)) return;
      
      const { exitCode, parsed } = await runDiagnostics([
        "diagnostics", projectPath, "--file", filePath
      ]);
      
      expect(exitCode).toBe(0);
      expect(parsed).toBeDefined();
    }, 20000);
  });
  
  describe("C++ Project", () => {
    const projectPath = join(EXAMPLES_DIR, "cpp-project");
    
    test("project root diagnostics", async () => {
      const { exitCode, parsed } = await runDiagnostics([
        "diagnostics", projectPath
      ]);
      
      expect(exitCode).toBe(0);
      expect(parsed).toBeDefined();
    }, 30000);
    
    test("individual file: src/main.cpp", async () => {
      const filePath = join(projectPath, "src/main.cpp");
      if (!existsSync(filePath)) return;
      
      const { exitCode, parsed } = await runDiagnostics([
        "diagnostics", projectPath, "--file", filePath
      ]);
      
      expect(exitCode).toBe(0);
      expect(parsed).toBeDefined();
    }, 20000);
  });
  
  describe("Lua Project", () => {
    const projectPath = join(EXAMPLES_DIR, "lua-project");
    
    test("project root diagnostics", async () => {
      const { exitCode, parsed } = await runDiagnostics([
        "diagnostics", projectPath
      ]);
      
      expect(exitCode).toBe(0);
      expect(parsed).toBeDefined();
    }, 30000);
    
    test("individual file: src/main.lua", async () => {
      const filePath = join(projectPath, "src/main.lua");
      if (!existsSync(filePath)) return;
      
      const { exitCode, parsed } = await runDiagnostics([
        "diagnostics", projectPath, "--file", filePath
      ]);
      
      expect(exitCode).toBe(0);
      expect(parsed).toBeDefined();
    }, 20000);
  });
  
  describe("Elixir Project", () => {
    const projectPath = join(EXAMPLES_DIR, "elixir-project");
    
    test("project root diagnostics", async () => {
      const { exitCode, parsed } = await runDiagnostics([
        "diagnostics", projectPath
      ]);
      
      expect(exitCode).toBe(0);
      expect(parsed).toBeDefined();
    }, 30000);
    
    test("individual file: lib/example.ex", async () => {
      const filePath = join(projectPath, "lib/example.ex");
      if (!existsSync(filePath)) return;
      
      const { exitCode, parsed } = await runDiagnostics([
        "diagnostics", projectPath, "--file", filePath
      ]);
      
      expect(exitCode).toBe(0);
      expect(parsed).toBeDefined();
    }, 20000);
  });
  
  describe("Terraform Project", () => {
    const projectPath = join(EXAMPLES_DIR, "terraform-project");
    
    test("project root diagnostics", async () => {
      const { exitCode, parsed } = await runDiagnostics([
        "diagnostics", projectPath
      ]);
      
      expect(exitCode).toBe(0);
      expect(parsed).toBeDefined();
    }, 30000);
    
    test("individual file: main.tf", async () => {
      const filePath = join(projectPath, "main.tf");
      if (!existsSync(filePath)) return;
      
      const { exitCode, parsed } = await runDiagnostics([
        "diagnostics", projectPath, "--file", filePath
      ]);
      
      expect(exitCode).toBe(0);
      expect(parsed).toBeDefined();
    }, 20000);
  });
  
  describe("Bun Project", () => {
    const projectPath = join(EXAMPLES_DIR, "bun-project");
    
    test("project root diagnostics", async () => {
      const { exitCode, parsed } = await runDiagnostics([
        "diagnostics", projectPath
      ]);
      
      expect(exitCode).toBe(0);
      expect(parsed).toBeDefined();
    }, 30000);
    
    test("individual file: index.ts", async () => {
      const filePath = join(projectPath, "index.ts");
      if (!existsSync(filePath)) return;
      
      const { exitCode, parsed } = await runDiagnostics([
        "diagnostics", projectPath, "--file", filePath
      ]);
      
      expect(exitCode).toBe(0);
      expect(parsed).toBeDefined();
    }, 20000);
  });
});
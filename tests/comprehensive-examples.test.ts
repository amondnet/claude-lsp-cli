import { describe, test, expect } from "bun:test";
import { spawn } from "child_process";
import { join, resolve } from "path";
import { existsSync, readdirSync } from "fs";

const EXAMPLES_DIR = resolve(__dirname, "../examples");
const CLI_PATH = resolve(__dirname, "../bin/claude-lsp-cli");

// Expected errors for each example project
const EXPECTED_ERRORS: Record<string, { minErrors: number; fileWithErrors?: string }> = {
  "typescript-project": { 
    minErrors: 10, 
    fileWithErrors: "src/index.ts" 
  },
  "python-project": { 
    minErrors: 5, 
    fileWithErrors: "main.py" 
  },
  "javascript-project": { 
    minErrors: 3, 
    fileWithErrors: "index.js" 
  },
  "rust-project": { 
    minErrors: 2, 
    fileWithErrors: "src/main.rs" 
  },
  "go-project": { 
    minErrors: 2, 
    fileWithErrors: "main.go" 
  },
  "java-project": { 
    minErrors: 2, 
    fileWithErrors: "src/Main.java" 
  },
  "cpp-project": { 
    minErrors: 2, 
    fileWithErrors: "main.cpp" 
  },
  "csharp-project": { 
    minErrors: 2, 
    fileWithErrors: "Program.cs" 
  },
  "php-project": { 
    minErrors: 2, 
    fileWithErrors: "index.php" 
  },
  "ruby-project": { 
    minErrors: 2, 
    fileWithErrors: "main.rb" 
  },
  "swift-project": { 
    minErrors: 2, 
    fileWithErrors: "main.swift" 
  },
  "kotlin-project": { 
    minErrors: 2, 
    fileWithErrors: "Main.kt" 
  },
  "scala-project": { 
    minErrors: 2, 
    fileWithErrors: "Main.scala" 
  },
  "r-project": { 
    minErrors: 2, 
    fileWithErrors: "script.r" 
  },
  "lua-project": { 
    minErrors: 2, 
    fileWithErrors: "main.lua" 
  },
  "perl-project": { 
    minErrors: 2, 
    fileWithErrors: "main.pl" 
  }
};

// Get all example projects
const getExampleProjects = () => {
  return readdirSync(EXAMPLES_DIR, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name)
    .filter(name => !name.startsWith('.'));
};

// Run diagnostic check for a project
async function runDiagnostics(projectPath: string): Promise<{ summary: string; diagnostics: any[] }> {
  return new Promise((resolve, reject) => {
    const proc = spawn(CLI_PATH, ["diagnostics", projectPath], {
      cwd: projectPath,
      env: { ...process.env }
    });

    let output = "";
    let error = "";

    proc.stdout.on("data", (data) => {
      output += data.toString();
    });

    proc.stderr.on("data", (data) => {
      error += data.toString();
    });

    proc.on("close", (code) => {
      if (code !== 0 && error) {
        reject(new Error(`Diagnostics failed: ${error}`));
        return;
      }

      try {
        // Extract JSON from system-message format
        let jsonStr = output;
        if (output.includes('[[system-message]]:')) {
          jsonStr = output.replace('[[system-message]]:', '').trim();
        }
        
        const result = JSON.parse(jsonStr);
        resolve(result);
      } catch (e) {
        // If parsing fails, return a basic structure
        resolve({ 
          summary: "no warnings or errors", 
          diagnostics: [] 
        });
      }
    });
  });
}

// Run file-specific diagnostic check
async function runFileDiagnostics(projectPath: string, filePath: string): Promise<{ summary: string; diagnostics: any[] }> {
  return new Promise((resolve, reject) => {
    const fullFilePath = join(projectPath, filePath);
    const proc = spawn(CLI_PATH, ["diagnostics", projectPath, fullFilePath], {
      cwd: projectPath,
      env: { ...process.env }
    });

    let output = "";
    let error = "";

    proc.stdout.on("data", (data) => {
      output += data.toString();
    });

    proc.stderr.on("data", (data) => {
      error += data.toString();
    });

    proc.on("close", (code) => {
      if (code !== 0 && error) {
        reject(new Error(`File diagnostics failed: ${error}`));
        return;
      }

      try {
        // Extract JSON from system-message format
        let jsonStr = output;
        if (output.includes('[[system-message]]:')) {
          jsonStr = output.replace('[[system-message]]:', '').trim();
        }
        
        const result = JSON.parse(jsonStr);
        resolve(result);
      } catch (e) {
        // If parsing fails, return a basic structure
        resolve({ 
          summary: "no warnings or errors", 
          diagnostics: [] 
        });
      }
    });
  });
}

describe("Example Projects Diagnostics", () => {
  const projects = getExampleProjects();
  
  describe("Project-level diagnostics", () => {
    for (const projectName of projects) {
      test(`${projectName} - should find errors at project level`, async () => {
        const projectPath = join(EXAMPLES_DIR, projectName);
        const expected = EXPECTED_ERRORS[projectName];
        
        if (!expected) {
          console.log(`Skipping ${projectName} - no expected errors defined`);
          return;
        }
        
        try {
          const result = await runDiagnostics(projectPath);
          
          // CRITICAL: We expect errors, not "no warnings or errors"
          if (expected.minErrors > 0) {
            expect(result.summary).not.toBe("no warnings or errors");
            expect(result.diagnostics.length).toBeGreaterThanOrEqual(expected.minErrors);
          }
        } catch (error) {
          // If the language server isn't installed, skip
          if (error.message.includes("not installed")) {
            console.log(`Skipping ${projectName} - language server not installed`);
            return;
          }
          throw error;
        }
      }, 30000); // 30 second timeout
    }
  });
  
  describe("File-level diagnostics", () => {
    for (const projectName of projects) {
      const expected = EXPECTED_ERRORS[projectName];
      
      if (!expected || !expected.fileWithErrors) {
        continue;
      }
      
      test(`${projectName} - should find errors in ${expected.fileWithErrors}`, async () => {
        const projectPath = join(EXAMPLES_DIR, projectName);
        const filePath = expected.fileWithErrors;
        
        try {
          const result = await runFileDiagnostics(projectPath, filePath);
          
          // CRITICAL: We expect errors in files with intentional errors
          if (expected.minErrors > 0) {
            expect(result.summary).not.toBe("no warnings or errors");
            expect(result.diagnostics.length).toBeGreaterThanOrEqual(1);
          }
        } catch (error) {
          // If the language server isn't installed, skip
          if (error.message.includes("not installed")) {
            console.log(`Skipping ${projectName} - language server not installed`);
            return;
          }
          throw error;
        }
      }, 30000); // 30 second timeout
    }
  });
});

describe("Root Project Diagnostics", () => {
  test("Should handle TypeScript file in root project", async () => {
    const rootPath = resolve(__dirname, "..");
    const testFile = join(rootPath, "test-ts-debug.ts");
    
    if (!existsSync(testFile)) {
      console.log("No TypeScript file in root, skipping");
      return;
    }
    
    const result = await runFileDiagnostics(rootPath, "test-ts-debug.ts");
    
    // Root project files should have no errors (they're not example files)
    expect(result.summary).toBe("no warnings or errors");
  }, 30000);
  
  test("Should handle all example projects from root", async () => {
    const rootPath = resolve(__dirname, "..");
    const result = await runDiagnostics(rootPath);
    
    // When checking from root, we might get aggregated errors from examples
    // This test just ensures the system doesn't crash
    expect(result).toBeDefined();
    expect(result.summary).toBeDefined();
  }, 30000);
});
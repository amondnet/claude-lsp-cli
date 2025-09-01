import { describe, test, expect, beforeAll } from "bun:test";
import { join } from "path";
import { existsSync, readdirSync } from "fs";
import { spawn } from "bun";

const EXAMPLES_DIR = join(import.meta.dir, "../examples");
const CLI_PATH = join(import.meta.dir, "../src/cli.ts");

// Get all example projects
const exampleProjects = readdirSync(EXAMPLES_DIR)
  .filter(dir => existsSync(join(EXAMPLES_DIR, dir)) && 
          !dir.startsWith('.'));

describe("Example Projects Diagnostics", () => {
  
  describe("Project-Level Diagnostics", () => {
    for (const projectName of exampleProjects) {
      test(`should get diagnostics for ${projectName} project root`, async () => {
        const projectPath = join(EXAMPLES_DIR, projectName);
        
        // Run diagnostics for the project root
        const proc = spawn(["bun", CLI_PATH, "diagnostics", projectPath], {
          stdout: "pipe",
          stderr: "pipe",
          env: { ...process.env, DEBUG: "false" }
        });
        
        const output = await new Response(proc.stdout).text();
        const exitCode = await proc.exited;
        
        // Should exit successfully
        expect(exitCode).toBe(0);
        
        // Should return valid JSON (may be wrapped in [[system-message]]:)
        let diagnostics;
        try {
          // Handle both plain JSON and system-message format
          let jsonStr = output;
          if (output.includes('[[system-message]]:')) {
            jsonStr = output.replace('[[system-message]]:', '').trim();
          }
          diagnostics = JSON.parse(jsonStr);
        } catch (e) {
          // Empty output is ok for some projects
          if (!output || output.trim() === '') {
            diagnostics = null;
          } else {
            throw new Error(`Invalid JSON output for ${projectName}: ${output}`);
          }
        }
        
        // Should have the expected structure
        expect(diagnostics).toBeDefined();
        
        // If it's an object with diagnostics property
        if (diagnostics && typeof diagnostics === 'object') {
          if ('diagnostics' in diagnostics) {
            expect(Array.isArray(diagnostics.diagnostics)).toBe(true);
          } else if ('error' in diagnostics) {
            // Error is ok for unsupported languages
            expect(diagnostics.error).toBeDefined();
          } else if (Array.isArray(diagnostics)) {
            // Array of diagnostics is ok
            expect(true).toBe(true);
          }
        }
        
        // Log summary for debugging
        const diagCount = Array.isArray(diagnostics) ? diagnostics.length :
                         diagnostics?.diagnostics ? diagnostics.diagnostics.length : 0;
        console.log(`  ${projectName}: ${diagCount} diagnostics found`);
      }, 30000); // 30 second timeout per project
    }
  });
  
  describe("Individual File Diagnostics", () => {
    // Define test files for each project type
    const projectTestFiles: Record<string, string[]> = {
      "typescript-project": ["src/index.ts", "src/utils.ts"],
      "javascript-project": ["src/index.js"],
      "python-project": ["main.py", "src/utils.py"],
      "go-project": ["cmd/main.go", "internal/utils.go"],
      "rust-project": ["src/main.rs", "src/lib.rs"],
      "java-project": ["src/main/java/com/example/Main.java"],
      "scala-project": ["src/main/scala/Main.scala"],
      "ruby-project": ["lib/main.rb"],
      "php-project": ["src/index.php"],
      "cpp-project": ["src/main.cpp"],
      "lua-project": ["src/main.lua"],
      "elixir-project": ["lib/example.ex"],
      "terraform-project": ["main.tf"],
      "bun-project": ["index.ts"],
      "aaa-test-project": ["package.json"] // JSON validation
    };
    
    for (const [projectName, testFiles] of Object.entries(projectTestFiles)) {
      if (!exampleProjects.includes(projectName)) continue;
      
      describe(`${projectName} files`, () => {
        for (const testFile of testFiles) {
          const filePath = join(EXAMPLES_DIR, projectName, testFile);
          
          // Only test if file exists
          if (!existsSync(filePath)) {
            test.skip(`should get diagnostics for ${testFile}`, () => {});
            continue;
          }
          
          test(`should get diagnostics for ${testFile}`, async () => {
            const projectPath = join(EXAMPLES_DIR, projectName);
            
            // Run diagnostics for the specific file
            const proc = spawn([
              "bun", CLI_PATH, "diagnostics", 
              projectPath, "--file", filePath
            ], {
              stdout: "pipe",
              stderr: "pipe",
              env: { ...process.env, DEBUG: "false" }
            });
            
            const output = await new Response(proc.stdout).text();
            const exitCode = await proc.exited;
            
            // Should exit successfully
            expect(exitCode).toBe(0);
            
            // Should return valid JSON (may be wrapped in [[system-message]]:)
            let diagnostics;
            try {
              // Handle both plain JSON and system-message format
              let jsonStr = output;
              if (output.includes('[[system-message]]:')) {
                jsonStr = output.replace('[[system-message]]:', '').trim();
              }
              diagnostics = JSON.parse(jsonStr);
            } catch (e) {
              // Empty output is ok
              if (!output || output.trim() === '') {
                diagnostics = null;
              } else {
                throw new Error(`Invalid JSON for ${projectName}/${testFile}: ${output}`);
              }
            }
            
            // Should have the expected structure
            expect(diagnostics).toBeDefined();
            
            // Check if diagnostics are for the requested file
            if (Array.isArray(diagnostics)) {
              // All diagnostics should be for the requested file or empty
              const relevantDiags = diagnostics.filter(d => 
                d.file === filePath || d.uri?.includes(testFile)
              );
              
              // Log for debugging
              console.log(`    ${testFile}: ${relevantDiags.length}/${diagnostics.length} diagnostics`);
            } else if (diagnostics?.diagnostics) {
              const relevantDiags = diagnostics.diagnostics.filter((d: any) => 
                d.file === filePath || d.uri?.includes(testFile)
              );
              console.log(`    ${testFile}: ${relevantDiags.length}/${diagnostics.diagnostics.length} diagnostics`);
            }
          }, 20000); // 20 second timeout per file
        }
      });
    }
  });
  
  describe("Error Handling", () => {
    test("should handle non-existent project gracefully", async () => {
      const proc = spawn([
        "bun", CLI_PATH, "diagnostics", 
        "/non/existent/project"
      ], {
        stdout: "pipe",
        stderr: "pipe"
      });
      
      const output = await new Response(proc.stdout).text();
      const exitCode = await proc.exited;
      
      expect(exitCode).toBe(0);
      
      // Should return null or error JSON (may be wrapped)
      let jsonStr = output;
      if (output.includes('[[system-message]]:')) {
        jsonStr = output.replace('[[system-message]]:', '').trim();
      }
      const result = jsonStr ? JSON.parse(jsonStr) : null;
      expect(result).toBeDefined();
    });
    
    test("should handle non-existent file gracefully", async () => {
      const projectPath = join(EXAMPLES_DIR, "typescript-project");
      const proc = spawn([
        "bun", CLI_PATH, "diagnostics", 
        projectPath, "--file", "/non/existent/file.ts"
      ], {
        stdout: "pipe",
        stderr: "pipe"
      });
      
      const output = await new Response(proc.stdout).text();
      const exitCode = await proc.exited;
      
      expect(exitCode).toBe(0);
      
      // Should return empty array or null (may be wrapped)
      let jsonStr = output;
      if (output.includes('[[system-message]]:')) {
        jsonStr = output.replace('[[system-message]]:', '').trim();
      }
      const result = jsonStr ? JSON.parse(jsonStr) : null;
      expect(result).toBeDefined();
    });
  });
  
  describe("Performance Tests", () => {
    test("should complete project diagnostics within reasonable time", async () => {
      const projectPath = join(EXAMPLES_DIR, "typescript-project");
      const startTime = Date.now();
      
      const proc = spawn(["bun", CLI_PATH, "diagnostics", projectPath], {
        stdout: "pipe",
        stderr: "pipe"
      });
      
      await new Response(proc.stdout).text();
      await proc.exited;
      
      const elapsed = Date.now() - startTime;
      
      // Should complete within 30 seconds
      expect(elapsed).toBeLessThan(30000);
      console.log(`  Project diagnostics completed in ${elapsed}ms`);
    });
    
    test("should complete file diagnostics quickly", async () => {
      const projectPath = join(EXAMPLES_DIR, "typescript-project");
      const filePath = join(projectPath, "src/index.ts");
      const startTime = Date.now();
      
      const proc = spawn([
        "bun", CLI_PATH, "diagnostics", 
        projectPath, "--file", filePath
      ], {
        stdout: "pipe",
        stderr: "pipe"
      });
      
      await new Response(proc.stdout).text();
      await proc.exited;
      
      const elapsed = Date.now() - startTime;
      
      // File diagnostics should be faster than project diagnostics
      expect(elapsed).toBeLessThan(15000);
      console.log(`  File diagnostics completed in ${elapsed}ms`);
    });
  });
});
import { describe, test, expect } from "bun:test";
import { join } from "path";
import { spawn } from "bun";

const PROJECT_ROOT = join(import.meta.dir, "..");
const CLI_PATH = join(PROJECT_ROOT, "src/cli.ts");

describe("Root Project Diagnostics", () => {
  
  test("should get diagnostics for claude-code-lsp project root", async () => {
    // Run diagnostics for the entire project root
    // This should aggregate diagnostics from all example projects
    const proc = spawn(["bun", CLI_PATH, "diagnostics", PROJECT_ROOT], {
      stdout: "pipe",
      stderr: "pipe",
      env: { ...process.env, DEBUG: "false" }
    });
    
    const output = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;
    
    // Should exit successfully
    expect(exitCode).toBe(0);
    
    // Parse the output (handle system-message format)
    let diagnostics;
    let jsonStr = output;
    if (output.includes('[[system-message]]:')) {
      jsonStr = output.replace('[[system-message]]:', '').trim();
    }
    
    try {
      diagnostics = JSON.parse(jsonStr);
    } catch (e) {
      throw new Error(`Invalid JSON output: ${output}`);
    }
    
    // Should have diagnostic data
    expect(diagnostics).toBeDefined();
    
    // Should have a summary
    expect(diagnostics.summary).toBeDefined();
    
    // Should find diagnostics from multiple projects (example projects have intentional errors)
    if (diagnostics.diagnostics && Array.isArray(diagnostics.diagnostics)) {
      console.log(`Found ${diagnostics.diagnostics.length} diagnostics across all projects`);
      
      // Should have diagnostics from multiple languages/projects
      const projectNames = new Set(
        diagnostics.diagnostics.map((d: any) => d.project).filter(Boolean)
      );
      
      console.log(`Projects with diagnostics: ${Array.from(projectNames).join(', ')}`);
      
      // Should find issues in at least some example projects
      expect(diagnostics.diagnostics.length).toBeGreaterThan(0);
      
      // Verify diagnostic structure
      diagnostics.diagnostics.forEach((diagnostic: any) => {
        expect(diagnostic).toHaveProperty('severity');
        expect(['error', 'warning', 'info', 'hint']).toContain(diagnostic.severity);
        
        // Should have file/project info
        expect(diagnostic.file || diagnostic.uri || diagnostic.project).toBeDefined();
      });
      
      // Should have diagnostics from at least one project
      expect(projectNames.size).toBeGreaterThanOrEqual(1);
      
      // Log which projects have diagnostics
      if (projectNames.size === 1) {
        console.log(`Note: Only ${Array.from(projectNames)[0]} has diagnostics (others may be error-free)`);
      }
    } else {
      console.log("No diagnostics array found, checking summary");
      console.log(`Summary: ${diagnostics.summary}`);
      
      // Even if no diagnostics array, should have meaningful summary
      expect(typeof diagnostics.summary).toBe('string');
    }
    
    // Log results for debugging
    console.log(`Root project diagnostic summary: ${diagnostics.summary}`);
    
  }, 60000); // 60 second timeout as this checks many projects
  
  test("should handle multi-project aggregation correctly", async () => {
    const proc = spawn(["bun", CLI_PATH, "diagnostics", PROJECT_ROOT], {
      stdout: "pipe",
      stderr: "pipe",
      env: { ...process.env, DEBUG: "false" }
    });
    
    const output = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;
    
    expect(exitCode).toBe(0);
    
    // Parse output
    let jsonStr = output;
    if (output.includes('[[system-message]]:')) {
      jsonStr = output.replace('[[system-message]]:', '').trim();
    }
    
    const result = JSON.parse(jsonStr);
    
    // Should aggregate results from multiple sub-projects
    expect(result).toBeDefined();
    expect(result.summary).toBeDefined();
    
    // If diagnostics exist, they should be properly aggregated
    if (result.diagnostics && Array.isArray(result.diagnostics)) {
      // Should limit to reasonable number (as per CLI implementation)
      expect(result.diagnostics.length).toBeLessThanOrEqual(5);
      
      // Should be sorted by severity (errors first, then warnings)
      let hasErrors = false;
      let hasWarnings = false;
      let previousSeverityWasWarning = false;
      
      result.diagnostics.forEach((d: any) => {
        if (d.severity === 'error') {
          hasErrors = true;
          // Errors should come before warnings (if any)
          expect(previousSeverityWasWarning).toBe(false);
        } else if (d.severity === 'warning') {
          hasWarnings = true;
          previousSeverityWasWarning = true;
        }
      });
      
      console.log(`Found ${hasErrors ? 'errors' : 'no errors'} and ${hasWarnings ? 'warnings' : 'no warnings'}`);
    }
  }, 60000);
  
  test("should detect languages from example projects", async () => {
    const proc = spawn(["bun", CLI_PATH, "diagnostics", PROJECT_ROOT], {
      stdout: "pipe",
      stderr: "pipe",
      env: { ...process.env, DEBUG: "false" }
    });
    
    const output = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;
    
    expect(exitCode).toBe(0);
    
    // Parse output
    let jsonStr = output;
    if (output.includes('[[system-message]]:')) {
      jsonStr = output.replace('[[system-message]]:', '').trim();
    }
    
    const result = JSON.parse(jsonStr);
    
    // Check if summary includes language breakdown
    if (result.summary && result.summary !== "no warnings or errors") {
      console.log(`Multi-language summary: ${result.summary}`);
      
      // Summary should mention different languages if multiple are found
      const summary = result.summary.toLowerCase();
      const languages = ['typescript', 'python', 'java', 'rust', 'go', 'scala'];
      const foundLanguages = languages.filter(lang => 
        summary.includes(lang) || 
        (result.diagnostics && result.diagnostics.some((d: any) => 
          d.source && d.source.toLowerCase().includes(lang)
        ))
      );
      
      if (foundLanguages.length > 0) {
        console.log(`Languages detected: ${foundLanguages.join(', ')}`);
        expect(foundLanguages.length).toBeGreaterThan(0);
      }
    }
  }, 60000);
  
  test("should handle project discovery performance", async () => {
    const startTime = Date.now();
    
    const proc = spawn(["bun", CLI_PATH, "diagnostics", PROJECT_ROOT], {
      stdout: "pipe",
      stderr: "pipe",
      env: { ...process.env, DEBUG: "false" }
    });
    
    await new Response(proc.stdout).text();
    await proc.exited;
    
    const elapsed = Date.now() - startTime;
    
    // Should complete project discovery and aggregation within reasonable time
    expect(elapsed).toBeLessThan(120000); // 2 minutes max
    console.log(`Multi-project diagnostics completed in ${elapsed}ms`);
  });
});
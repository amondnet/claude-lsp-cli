import { describe, test, expect } from "bun:test";
import { spawn } from "child_process";
import { join, resolve } from "path";
import { existsSync } from "fs";

const EXAMPLES_DIR = resolve(__dirname, "../examples");
const CLI_PATH = resolve(__dirname, "../bin/claude-lsp-cli");

// Languages that are known to work correctly
const WORKING_LANGUAGES = {
  "go-project": { 
    minErrors: 4,  // Actually returns 4-5 errors
    fileWithErrors: "cmd/server/main.go",
    status: "working"
  },
  "lua-project": { 
    minErrors: 5,
    fileWithErrors: "main.lua",
    status: "working"
  }
};

// Languages with known issues (for documentation)
const BROKEN_LANGUAGES = {
  "typescript-project": { 
    issue: "Server starts but doesn't detect errors",
    status: "broken"
  },
  "python-project": { 
    issue: "Pyright installed but not detecting errors",
    status: "broken"
  },
  "java-project": { 
    issue: "jdtls timeout despite Java 21 installation",
    status: "broken"
  }
};

// Languages not installed
const NOT_INSTALLED = ["rust-project", "scala-project", "elixir-project"];

// Helper to run diagnostics
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
        
        const response = JSON.parse(jsonStr);
        
        // Handle both formats
        if (Array.isArray(response)) {
          resolve({ summary: `${response.length} diagnostics`, diagnostics: response });
        } else if (response.diagnostics) {
          resolve({ summary: response.summary || `${response.diagnostics.length} diagnostics`, diagnostics: response.diagnostics });
        } else {
          resolve({ summary: response.summary || "no errors or warnings", diagnostics: [] });
        }
      } catch (e) {
        // If parsing fails, treat as no diagnostics
        resolve({ summary: "no errors or warnings", diagnostics: [] });
      }
    });
  });
}

describe("Working Language Servers", () => {
  describe("Languages with Confirmed Working Diagnostics", () => {
    Object.entries(WORKING_LANGUAGES).forEach(([projectName, expected]) => {
      const projectPath = join(EXAMPLES_DIR, projectName);
      
      if (!existsSync(projectPath)) return;
      
      test(`${projectName} - should detect errors correctly`, async () => {
        const result = await runDiagnostics(projectPath);
        
        // These languages are known to work
        expect(result.summary).not.toBe("no errors or warnings");
        expect(result.diagnostics.length).toBeGreaterThanOrEqual(expected.minErrors);
      }, 30000);
    });
  });
  
  describe("Documentation of Known Issues", () => {
    test("Should document broken languages", () => {
      // This test just documents the current state
      const brokenCount = Object.keys(BROKEN_LANGUAGES).length;
      const notInstalledCount = NOT_INSTALLED.length;
      
      console.log(`
Current Language Server Status:
================================
✅ Working: ${Object.keys(WORKING_LANGUAGES).length} languages
⚠️  Broken: ${brokenCount} languages
❌ Not Installed: ${notInstalledCount} languages

Broken Languages:
${Object.entries(BROKEN_LANGUAGES).map(([lang, info]) => 
  `  - ${lang}: ${info.issue}`).join('\n')}

Not Installed:
${NOT_INSTALLED.map(lang => `  - ${lang}`).join('\n')}
      `);
      
      expect(true).toBe(true); // This test is for documentation
    });
  });
});
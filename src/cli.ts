#!/usr/bin/env bun

/**
 * Claude LSP CLI - Simple file-based diagnostics
 * 
 * Usage:
 *   claude-lsp-cli hook <event-type>     - Handle Claude Code hook events
 *   claude-lsp-cli diagnostics <file>    - Check file for errors
 *   claude-lsp-cli help                  - Show help
 */

import { resolve, join } from "path";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { checkFile, formatDiagnostics } from "./file-checker";

// Parse command line arguments
const args = process.argv.slice(2);
const command = args[0];

// Hook deduplication functions
function getProjectRoot(filePath: string): string {
  let dir = filePath;
  while (dir !== "/" && dir.length > 1) {
    dir = join(dir, "..");
    if (existsSync(join(dir, "package.json")) || 
        existsSync(join(dir, "pyproject.toml")) ||
        existsSync(join(dir, "go.mod")) ||
        existsSync(join(dir, "Cargo.toml")) ||
        existsSync(join(dir, ".git"))) {
      return dir;
    }
  }
  return "/tmp";
}

function getStateFile(projectRoot: string): string {
  const projectHash = projectRoot.replace(/[^a-zA-Z0-9]/g, "_");
  return `/tmp/claude-lsp-last-${projectHash}.json`;
}

function shouldShowResult(filePath: string, diagnosticsCount: number): boolean {
  const projectRoot = getProjectRoot(filePath);
  const stateFile = getStateFile(projectRoot);
  
  try {
    if (existsSync(stateFile)) {
      const lastResult = JSON.parse(readFileSync(stateFile, "utf-8"));
      if (lastResult.file === filePath && 
          lastResult.diagnosticsCount === diagnosticsCount &&
          Date.now() - lastResult.timestamp < 2000) {
        return false;
      }
    }
  } catch {}
  
  return true;
}

function markResultShown(filePath: string, diagnosticsCount: number): void {
  const projectRoot = getProjectRoot(filePath);
  const stateFile = getStateFile(projectRoot);
  
  try {
    writeFileSync(stateFile, JSON.stringify({
      file: filePath,
      diagnosticsCount,
      timestamp: Date.now()
    }));
  } catch {}
}

function extractFilePaths(hookData: any): string[] {
  const files: string[] = [];
  
  // Check single file candidates first
  const candidates = [
    hookData?.tool_input?.file_path,
    hookData?.tool_response?.filePath,
    hookData?.input?.file_path,
    hookData?.output?.file_path,
  ];
  
  for (const candidate of candidates) {
    if (candidate && typeof candidate === "string") {
      if (candidate.match(/\.(ts|tsx|py|go|rs|java|c|cpp|php|swift|kt|scala|tf)$/i)) {
        files.push(candidate);
      }
    }
  }
  
  // Check Bash commands for multiple files
  if (hookData?.tool_name === "Bash") {
    // Prioritize output first (contains actual processed files after wildcard expansion)
    if (hookData?.tool_response?.output) {
      const output = hookData.tool_response.output;
      const fileRegex = /(?:^|\s|["'])([^\s"']*[\/\\]?[^\s"']*\.(?:ts|tsx|py|go|rs|java|c|cpp|php|swift|kt|scala|tf))(?:$|\s|["'])/gmi;
      let match;
      while ((match = fileRegex.exec(output)) !== null) {
        files.push(match[1]);
      }
    }
    
    // Fall back to command input only if no files found in output
    if (files.length === 0 && hookData?.tool_input?.command) {
      const command = hookData.tool_input.command;
      const fileRegex = /(?:^|\s|["'])([^\s"']*[\/\\]?[^\s"']*\.(?:ts|tsx|py|go|rs|java|c|cpp|php|swift|kt|scala|tf))(?:$|\s|["'])/gmi;
      let match;
      while ((match = fileRegex.exec(command)) !== null) {
        files.push(match[1]);
      }
    }
  }
  
  // Remove duplicates and return
  return Array.from(new Set(files));
}

function extractFilePath(hookData: any): string | null {
  const files = extractFilePaths(hookData);
  return files.length > 0 ? files[0] : null;
}

async function handleHookEvent(eventType: string): Promise<void> {
  if (eventType === "PostToolUse") {
    try {
      const input = await Bun.stdin.text();
      if (!input.trim()) {
        process.exit(0);
      }
      
      let hookData: any;
      try {
        hookData = JSON.parse(input);
      } catch {
        process.exit(0);
      }
      
      const filePaths = extractFilePaths(hookData);
      if (filePaths.length === 0) {
        process.exit(0);
      }
      
      // Process all files in parallel and collect results
      const absolutePaths = filePaths.map(filePath => 
        filePath.startsWith("/") 
          ? filePath 
          : join(hookData?.cwd || process.cwd(), filePath)
      );
      
      const results = await Promise.all(
        absolutePaths.map(absolutePath => checkFile(absolutePath))
      );
      
      let allDiagnostics = [];
      let hasErrors = false;
      
      for (let i = 0; i < results.length; i++) {
        const result = results[i];
        const absolutePath = absolutePaths[i];
        
        if (result && result.diagnostics.length > 0) {
          const importantIssues = result.diagnostics.filter(
            d => d.severity === "error" || d.severity === "warning"
          );
          
          if (importantIssues.length > 0 && shouldShowResult(absolutePath, importantIssues.length)) {
            // Add file context to diagnostics
            const fileRelativePath = result.file || filePaths[i];
            for (const diag of importantIssues) {
              allDiagnostics.push({
                ...diag,
                file: fileRelativePath
              });
            }
            markResultShown(absolutePath, importantIssues.length);
            hasErrors = true;
          }
        }
      }
      
      // Show combined results if any errors found
      if (hasErrors && allDiagnostics.length > 0) {
        const errors = allDiagnostics.filter(d => d.severity === "error");
        const warnings = allDiagnostics.filter(d => d.severity === "warning");
        
        const summaryParts = [];
        if (errors.length > 0) summaryParts.push(`${errors.length} error(s)`);
        if (warnings.length > 0) summaryParts.push(`${warnings.length} warnings`);
        
        const combinedResult = {
          diagnostics: allDiagnostics.slice(0, 5), // Show at most 5 items
          summary: summaryParts.join(", ")
        };
        
        console.error(`[[system-message]]:${JSON.stringify(combinedResult)}`);
        process.exit(2);
      }
      
      process.exit(0);
      
    } catch (error) {
      console.error(`Hook processing failed: ${error}`);
      process.exit(1);
    }
  } else {
    console.error(`Unknown event type: ${eventType}`);
    process.exit(1);
  }
}

async function showHelp(): Promise<void> {
  console.log(`Claude LSP CLI - File-based diagnostics for Claude Code

Commands:
  hook <event>          Handle Claude Code hook events
  diagnostics <file>    Check individual file for errors/warnings
  help                  Show this help message

Examples:
  claude-lsp-cli diagnostics src/index.ts
  claude-lsp-cli hook PostToolUse

Supported Languages:
  TypeScript, Python, Go, Rust, Java, C++, PHP, Scala, Terraform
  Swift, Kotlin (if tools installed)

Features:
  • Direct tool invocation (no LSP servers)
  • Built-in deduplication  
  • Fast single-file checking
  • Standardized JSON output format
`);
}

// Main execution
(async () => {
  if (command === "hook" && args[1]) {
    await handleHookEvent(args[1]);
  } else if (command === "diagnostics" && args[1]) {
    const filePath = resolve(args[1]);
    
    if (!existsSync(filePath)) {
      console.error(`File not found: ${filePath}`);
      process.exit(1);
    }
    
    const result = await checkFile(filePath);
    if (result && result.diagnostics.length > 0) {
      const formatted = formatDiagnostics(result);
      if (formatted) {
        console.log(formatted);
      }
    } else {
      console.log('[[system-message]]:{"summary":"no errors or warnings"}');
    }
    
    // CLI always exits 0 (success) - only program errors use non-zero
    process.exit(0);
  } else if (command === "help" || !command) {
    await showHelp();
    process.exit(0);
  } else {
    console.error(`Unknown command: ${command}`);
    console.error("Run 'claude-lsp-cli help' for usage information");
    process.exit(1);
  }
})();
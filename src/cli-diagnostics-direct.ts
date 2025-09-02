#!/usr/bin/env bun
/**
 * CLI Diagnostics with Direct Type Checking
 * 
 * Simplified diagnostic collection using direct tool invocation
 * instead of LSP servers.
 */

import { existsSync } from "fs";
import { join, dirname, relative } from "path";
import { logger } from "./utils/logger";
import { runDirectCheck } from "./direct-checker";

/**
 * Find the project root from a file path
 */
export async function findProjectRoot(filePath: string): Promise<string | null> {
  let currentDir = dirname(filePath);
  
  // Project markers in order of preference
  const projectMarkers = [
    ".git",
    "package.json",
    "tsconfig.json",
    "pyproject.toml",
    "go.mod",
    "Cargo.toml",
    "pom.xml",
    "build.gradle",
    ".project"
  ];
  
  // Walk up the directory tree
  while (currentDir !== "/" && currentDir !== ".") {
    for (const marker of projectMarkers) {
      if (existsSync(join(currentDir, marker))) {
        return currentDir;
      }
    }
    
    const parentDir = dirname(currentDir);
    if (parentDir === currentDir) break;
    currentDir = parentDir;
  }
  
  return null;
}

/**
 * Run diagnostics for a project using direct type checking
 */
export async function runDirectDiagnostics(projectRoot: string) {
  try {
    const results = await runDirectCheck(projectRoot);
    
    // Aggregate all diagnostics
    const allDiagnostics: any[] = [];
    
    for (const result of results) {
      for (const diag of result.diagnostics) {
        // Convert to Claude's expected format
        allDiagnostics.push({
          file: diag.file.startsWith("/") ? diag.file : join(projectRoot, diag.file),
          line: diag.line,
          column: diag.column,
          severity: diag.severity,
          message: diag.message,
          source: result.tool
        });
      }
    }
    
    // Format as system message for Claude
    if (allDiagnostics.length > 0) {
      const errors = allDiagnostics.filter(d => d.severity === "error").length;
      const warnings = allDiagnostics.filter(d => d.severity === "warning").length;
      
      // Group by file for better readability
      const byFile = new Map<string, any[]>();
      for (const diag of allDiagnostics) {
        const relPath = relative(projectRoot, diag.file);
        if (!byFile.has(relPath)) {
          byFile.set(relPath, []);
        }
        byFile.get(relPath)!.push(diag);
      }
      
      // Build formatted output
      let output = `[[system-message]]: Code diagnostics found ${errors} errors and ${warnings} warnings\n\n`;
      
      // Show up to 20 most important issues
      let shown = 0;
      const maxToShow = 20;
      
      // First show errors, then warnings
      for (const [file, diags] of byFile) {
        const fileErrors = diags.filter(d => d.severity === "error");
        for (const diag of fileErrors) {
          if (shown >= maxToShow) break;
          output += `${file}:${diag.line}:${diag.column} ${diag.severity}: ${diag.message}\n`;
          shown++;
        }
      }
      
      if (shown < maxToShow) {
        for (const [file, diags] of byFile) {
          const fileWarnings = diags.filter(d => d.severity === "warning");
          for (const diag of fileWarnings) {
            if (shown >= maxToShow) break;
            output += `${file}:${diag.line}:${diag.column} ${diag.severity}: ${diag.message}\n`;
            shown++;
          }
        }
      }
      
      if (allDiagnostics.length > maxToShow) {
        output += `\n... and ${allDiagnostics.length - maxToShow} more issues\n`;
      }
      
      output += `\nRun 'claude-lsp-cli diagnostics ${projectRoot}' to see all issues.`;
      
      return {
        diagnostics: allDiagnostics,
        formatted: output,
        summary: `${errors} errors, ${warnings} warnings`
      };
    }
    
    return {
      diagnostics: [],
      formatted: "",
      summary: "no warnings or errors"
    };
    
  } catch (error) {
    logger.error("Failed to run direct diagnostics", { error, projectRoot });
    return {
      diagnostics: [],
      formatted: "",
      summary: "diagnostics failed"
    };
  }
}

/**
 * Extract file path from hook data (handles actual Claude Code hook schema)
 */
export function extractFilePath(hookData: any): string | null {
  // Official Claude Code hook schema paths
  const candidates = [
    // From tool_input (Write, Edit, etc.)
    hookData?.tool_input?.file_path,
    hookData?.tool_input?.input_path,
    hookData?.tool_input?.path,
    
    // From tool_response
    hookData?.tool_response?.filePath,
    hookData?.tool_response?.file_path,
    
    // Legacy/test format (from existing tests)
    hookData?.input?.file_path,
    hookData?.output?.file_path,
    
    // For MultiEdit tools - check edits array
    hookData?.tool_input?.edits?.[0]?.file_path,
    
    // For Write tool with content
    hookData?.tool_input?.content && hookData?.tool_input?.file_path
  ];
  
  for (const candidate of candidates) {
    if (candidate && typeof candidate === "string" && candidate.length > 0) {
      // Validate it looks like a file path
      if (candidate.includes("/") || candidate.includes("\\")) {
        return candidate;
      }
    }
  }
  
  // Try to extract from tool response messages or output
  const outputText = hookData?.tool_response?.message || 
                    hookData?.tool_response?.output ||
                    hookData?.output;
                    
  if (outputText && typeof outputText === "string") {
    // Look for file paths in output (common patterns)
    const patterns = [
      /File "([^"]+)"/,
      /file:?\s+([^\s:]+)/i,
      /(?:wrote?|created?|modified?)\s+['"]?([^\s'"]+)/i,
      /at\s+([^\s:]+):\d+/,
      /^([^\s:]+):\d+:/m
    ];
    
    for (const pattern of patterns) {
      const match = outputText.match(pattern);
      if (match && match[1]) {
        return match[1];
      }
    }
  }
  
  return null;
}

// CLI interface
if (import.meta.main) {
  const projectRoot = process.argv[2] || process.cwd();
  
  const result = await runDirectDiagnostics(projectRoot);
  
  if (result.formatted) {
    console.log(result.formatted);
  } else {
    console.log(`No issues found in ${projectRoot}`);
  }
  
  process.exit(result.diagnostics.length > 0 ? 1 : 0);
}
#!/usr/bin/env bun
/**
 * File-Based Type Checker - Simple per-file diagnostics
 * 
 * No project discovery, just check individual files based on their type
 */

import { spawn } from "bun";
import { existsSync } from "fs";
import { dirname, basename, extname } from "path";
import { logger } from "./utils/logger";

// Timeout for type checkers (5 seconds default, can be overridden)
const CHECKER_TIMEOUT = parseInt(process.env.CLAUDE_LSP_TIMEOUT || "5000");

export interface FileCheckResult {
  file: string;
  tool: string;
  diagnostics: Array<{
    line: number;
    column: number;
    severity: "error" | "warning" | "info";
    message: string;
  }>;
}

/**
 * Language checkers by file extension
 */
const FILE_CHECKERS: Record<string, (file: string) => Promise<FileCheckResult>> = {
  // TypeScript
  ".ts": checkTypeScript,
  ".tsx": checkTypeScript,
  ".mts": checkTypeScript,
  ".cts": checkTypeScript,
  
  // JavaScript
  ".js": checkJavaScript,
  ".jsx": checkJavaScript,
  ".mjs": checkJavaScript,
  ".cjs": checkJavaScript,
  
  // Python
  ".py": checkPython,
  ".pyi": checkPython,
  
  // Go
  ".go": checkGo,
  
  // Rust
  ".rs": checkRust,
  
  // Java
  ".java": checkJava,
  
  // C/C++
  ".c": checkC,
  ".cpp": checkCpp,
  ".cc": checkCpp,
  ".cxx": checkCpp,
  ".h": checkC,
  ".hpp": checkCpp,
  
  // Ruby
  ".rb": checkRuby,
  
  // PHP
  ".php": checkPHP,
  
  // Swift
  ".swift": checkSwift,
  
  // Kotlin
  ".kt": checkKotlin,
  ".kts": checkKotlin,
};

/**
 * Check a single file for type errors
 */
export async function checkFile(filePath: string): Promise<FileCheckResult | null> {
  if (!existsSync(filePath)) {
    return null;
  }
  
  const ext = extname(filePath).toLowerCase();
  const checker = FILE_CHECKERS[ext];
  
  if (!checker) {
    logger.debug(`No checker for extension: ${ext}`);
    return null;
  }
  
  try {
    return await checker(filePath);
  } catch (error) {
    logger.error(`Failed to check file: ${filePath}`, { error });
    return {
      file: filePath,
      tool: "unknown",
      diagnostics: []
    };
  }
}

/**
 * Run a command with timeout
 */
async function runWithTimeout(
  args: string[], 
  options: any = {},
  timeout: number = CHECKER_TIMEOUT
): Promise<{ stdout: string; stderr: string; exitCode: number; timedOut: boolean }> {
  const proc = spawn(args, {
    stdio: ["ignore", "pipe", "pipe"],
    ...options
  });
  
  // Create timeout promise
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => {
      proc.kill();
      reject(new Error(`Command timed out after ${timeout}ms`));
    }, timeout);
  });
  
  try {
    // Race between process completion and timeout
    const [stdout, stderr] = await Promise.race([
      Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text()
      ]),
      timeoutPromise
    ]);
    
    const exitCode = await proc.exited;
    return { stdout, stderr, exitCode, timedOut: false };
  } catch (error) {
    // Timeout occurred
    logger.debug(`Command timed out: ${args[0]}`, { timeout });
    return { stdout: "", stderr: "", exitCode: -1, timedOut: true };
  }
}

// Individual language checkers

async function checkTypeScript(file: string): Promise<FileCheckResult> {
  const result: FileCheckResult = {
    file,
    tool: "tsc",
    diagnostics: []
  };
  
  // Try to find tsconfig.json in parent directories
  let tsConfig = await findUpward(dirname(file), "tsconfig.json");
  
  // For single file checking, don't use -p with tsconfig (it checks whole project)
  const args = ["tsc", "--noEmit", "--pretty", "false", "--allowJs", "--checkJs", file];
  
  try {
    const { stdout, stderr, timedOut } = await runWithTimeout(args, {
      env: { ...process.env, NO_COLOR: "1" }
    });
    
    if (timedOut) {
      result.diagnostics.push({
        line: 1,
        column: 1,
        severity: "warning",
        message: "TypeScript check timed out after 5 seconds"
      });
      return result;
    }
    
    // TypeScript outputs to stderr
    const output = stderr || stdout;
    
    // Parse TypeScript output
    const lines = output.split("\n");
    for (const line of lines) {
      // file.ts(line,col): error TS2322: message
      const match = line.match(/^(.+?)\((\d+),(\d+)\): (error|warning) TS\d+: (.+)$/);
      if (match) {
        // Only include errors for the target file (not dependencies)
        const errorFile = match[1];
        // Check if this error is for our target file
        if (errorFile.includes(basename(file))) {
          result.diagnostics.push({
            line: parseInt(match[2]),
            column: parseInt(match[3]),
            severity: match[4] as "error" | "warning",
            message: match[5]
          });
        }
      }
    }
  } catch (error) {
    // tsc not installed or failed
    logger.debug(`TypeScript check failed for ${file}`, { error });
  }
  
  return result;
}

async function checkJavaScript(file: string): Promise<FileCheckResult> {
  const result: FileCheckResult = {
    file,
    tool: "eslint",
    diagnostics: []
  };
  
  // Try ESLint if available
  try {
    const proc = spawn(["eslint", "--format", "json", file], {
      stdio: ["ignore", "pipe", "pipe"]
    });
    
    const stdout = await new Response(proc.stdout).text();
    await proc.exited;
    
    const eslintResults = JSON.parse(stdout);
    if (eslintResults[0]?.messages) {
      for (const msg of eslintResults[0].messages) {
        result.diagnostics.push({
          line: msg.line || 1,
          column: msg.column || 1,
          severity: msg.severity === 2 ? "error" : "warning",
          message: `${msg.message} (${msg.ruleId || "unknown"})`
        });
      }
    }
  } catch {
    // ESLint not available, that's ok for JS
  }
  
  return result;
}

async function checkPython(file: string): Promise<FileCheckResult> {
  const result: FileCheckResult = {
    file,
    tool: "pyright",
    diagnostics: []
  };
  
  // Try pyright first
  try {
    const proc = spawn(["pyright", "--outputjson", file], {
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, PATH: `/Users/steven_chong/.bun/bin:${process.env.PATH}` }
    });
    
    const stdout = await new Response(proc.stdout).text();
    await proc.exited;
    
    const pyrightResult = JSON.parse(stdout);
    for (const diag of pyrightResult.generalDiagnostics || []) {
      if (diag.file.includes(basename(file))) {
        result.diagnostics.push({
          line: diag.range?.start?.line + 1 || 1,
          column: diag.range?.start?.character + 1 || 1,
          severity: diag.severity === "error" ? "error" : "warning",
          message: diag.message
        });
      }
    }
  } catch {
    // Try mypy as fallback
    try {
      const proc = spawn(["mypy", "--no-error-summary", "--show-column-numbers", file], {
        stdio: ["ignore", "pipe", "pipe"]
      });
      
      const stdout = await new Response(proc.stdout).text();
      await proc.exited;
      
      result.tool = "mypy";
      const lines = stdout.split("\n");
      for (const line of lines) {
        // file.py:line:col: error: message
        const match = line.match(/^.+?:(\d+):(\d+): (error|warning|note): (.+)$/);
        if (match) {
          result.diagnostics.push({
            line: parseInt(match[1]),
            column: parseInt(match[2]),
            severity: match[3] === "error" ? "error" : "warning",
            message: match[4]
          });
        }
      }
    } catch {
      // No Python checker available
    }
  }
  
  return result;
}

async function checkGo(file: string): Promise<FileCheckResult> {
  const result: FileCheckResult = {
    file,
    tool: "go",
    diagnostics: []
  };
  
  try {
    const proc = spawn(["go", "vet", file], {
      stdio: ["ignore", "pipe", "pipe"]
    });
    
    const stderr = await new Response(proc.stderr).text();
    await proc.exited;
    
    // go vet format: file:line:col: message
    const lines = stderr.split("\n");
    for (const line of lines) {
      const match = line.match(/^.+?:(\d+):(\d+): (.+)$/);
      if (match) {
        result.diagnostics.push({
          line: parseInt(match[1]),
          column: parseInt(match[2]),
          severity: "error",
          message: match[3]
        });
      }
    }
  } catch {
    // go not installed
  }
  
  return result;
}

async function checkRust(file: string): Promise<FileCheckResult> {
  const result: FileCheckResult = {
    file,
    tool: "rustc",
    diagnostics: []
  };
  
  try {
    // Use rustc for single file checking
    const proc = spawn(["rustc", "--error-format=json", "--crate-type", "lib", "-Z", "no-codegen", file], {
      stdio: ["ignore", "pipe", "pipe"]
    });
    
    const stderr = await new Response(proc.stderr).text();
    await proc.exited;
    
    // Parse JSON output
    const lines = stderr.split("\n");
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const msg = JSON.parse(line);
        if (msg.message && msg.spans?.[0]) {
          const span = msg.spans[0];
          result.diagnostics.push({
            line: span.line_start || 1,
            column: span.column_start || 1,
            severity: msg.level === "error" ? "error" : "warning",
            message: msg.message
          });
        }
      } catch {
        // Not JSON line
      }
    }
  } catch {
    // rustc not available
  }
  
  return result;
}

async function checkJava(file: string): Promise<FileCheckResult> {
  const result: FileCheckResult = {
    file,
    tool: "javac",
    diagnostics: []
  };
  
  try {
    const proc = spawn(["javac", "-Xlint:all", "-d", "/tmp", file], {
      stdio: ["ignore", "pipe", "pipe"]
    });
    
    const stderr = await new Response(proc.stderr).text();
    await proc.exited;
    
    // javac format: file:line: error: message
    const lines = stderr.split("\n");
    for (const line of lines) {
      const match = line.match(/^.+?:(\d+): (error|warning): (.+)$/);
      if (match) {
        result.diagnostics.push({
          line: parseInt(match[1]),
          column: 1,
          severity: match[2] as "error" | "warning",
          message: match[3]
        });
      }
    }
  } catch {
    // javac not available
  }
  
  return result;
}

async function checkC(file: string): Promise<FileCheckResult> {
  const result: FileCheckResult = {
    file,
    tool: "gcc",
    diagnostics: []
  };
  
  try {
    const proc = spawn(["gcc", "-fsyntax-only", "-Wall", file], {
      stdio: ["ignore", "pipe", "pipe"]
    });
    
    const stderr = await new Response(proc.stderr).text();
    await proc.exited;
    
    // gcc format: file:line:col: error: message
    const lines = stderr.split("\n");
    for (const line of lines) {
      const match = line.match(/^.+?:(\d+):(\d+): (error|warning): (.+)$/);
      if (match) {
        result.diagnostics.push({
          line: parseInt(match[1]),
          column: parseInt(match[2]),
          severity: match[3] as "error" | "warning",
          message: match[4]
        });
      }
    }
  } catch {
    // gcc not available
  }
  
  return result;
}

async function checkCpp(file: string): Promise<FileCheckResult> {
  const result: FileCheckResult = {
    file,
    tool: "g++",
    diagnostics: []
  };
  
  try {
    const proc = spawn(["g++", "-fsyntax-only", "-Wall", "-std=c++17", file], {
      stdio: ["ignore", "pipe", "pipe"]
    });
    
    const stderr = await new Response(proc.stderr).text();
    await proc.exited;
    
    // g++ format: file:line:col: error: message
    const lines = stderr.split("\n");
    for (const line of lines) {
      const match = line.match(/^.+?:(\d+):(\d+): (error|warning): (.+)$/);
      if (match) {
        result.diagnostics.push({
          line: parseInt(match[1]),
          column: parseInt(match[2]),
          severity: match[3] as "error" | "warning",
          message: match[4]
        });
      }
    }
  } catch {
    // g++ not available
  }
  
  return result;
}

async function checkRuby(file: string): Promise<FileCheckResult> {
  const result: FileCheckResult = {
    file,
    tool: "ruby",
    diagnostics: []
  };
  
  try {
    // Ruby syntax check
    const proc = spawn(["ruby", "-c", file], {
      stdio: ["ignore", "pipe", "pipe"]
    });
    
    const stderr = await new Response(proc.stderr).text();
    await proc.exited;
    
    // Ruby syntax error format
    const match = stderr.match(/^.+?:(\d+): (.+)$/m);
    if (match) {
      result.diagnostics.push({
        line: parseInt(match[1]),
        column: 1,
        severity: "error",
        message: match[2]
      });
    }
  } catch {
    // ruby not available
  }
  
  return result;
}

async function checkPHP(file: string): Promise<FileCheckResult> {
  const result: FileCheckResult = {
    file,
    tool: "php",
    diagnostics: []
  };
  
  try {
    // PHP lint
    const proc = spawn(["php", "-l", file], {
      stdio: ["ignore", "pipe", "pipe"]
    });
    
    const stdout = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();
    await proc.exited;
    
    const output = stdout + stderr;
    // PHP Parse error: syntax error, unexpected ... in file on line X
    const match = output.match(/Parse error: (.+) in .+ on line (\d+)/);
    if (match) {
      result.diagnostics.push({
        line: parseInt(match[2]),
        column: 1,
        severity: "error",
        message: match[1]
      });
    }
  } catch {
    // php not available
  }
  
  return result;
}

async function checkSwift(file: string): Promise<FileCheckResult> {
  const result: FileCheckResult = {
    file,
    tool: "swiftc",
    diagnostics: []
  };
  
  try {
    const proc = spawn(["swiftc", "-parse", file], {
      stdio: ["ignore", "pipe", "pipe"]
    });
    
    const stderr = await new Response(proc.stderr).text();
    await proc.exited;
    
    // Swift error format: file:line:col: error: message
    const lines = stderr.split("\n");
    for (const line of lines) {
      const match = line.match(/^.+?:(\d+):(\d+): (error|warning): (.+)$/);
      if (match) {
        result.diagnostics.push({
          line: parseInt(match[1]),
          column: parseInt(match[2]),
          severity: match[3] as "error" | "warning",
          message: match[4]
        });
      }
    }
  } catch {
    // swiftc not available
  }
  
  return result;
}

async function checkKotlin(file: string): Promise<FileCheckResult> {
  const result: FileCheckResult = {
    file,
    tool: "kotlinc",
    diagnostics: []
  };
  
  try {
    const proc = spawn(["kotlinc", "-no-stdlib", file], {
      stdio: ["ignore", "pipe", "pipe"]
    });
    
    const stderr = await new Response(proc.stderr).text();
    await proc.exited;
    
    // Kotlin error format: file:line:col: error: message
    const lines = stderr.split("\n");
    for (const line of lines) {
      const match = line.match(/^.+?:(\d+):(\d+): (error|warning): (.+)$/);
      if (match) {
        result.diagnostics.push({
          line: parseInt(match[1]),
          column: parseInt(match[2]),
          severity: match[3] as "error" | "warning",
          message: match[4]
        });
      }
    }
  } catch {
    // kotlinc not available
  }
  
  return result;
}

// Utility function to find file upward
async function findUpward(startDir: string, filename: string): Promise<string | null> {
  let currentDir = startDir;
  
  while (currentDir !== "/" && currentDir !== ".") {
    const candidate = `${currentDir}/${filename}`;
    if (existsSync(candidate)) {
      return candidate;
    }
    
    const parent = dirname(currentDir);
    if (parent === currentDir) break;
    currentDir = parent;
  }
  
  return null;
}

// Format diagnostics for Claude
export function formatDiagnostics(result: FileCheckResult): string {
  if (!result || result.diagnostics.length === 0) {
    return "";
  }
  
  const errors = result.diagnostics.filter(d => d.severity === "error");
  const warnings = result.diagnostics.filter(d => d.severity === "warning");
  
  let output = `[[system-message]]: ${basename(result.file)} has ${errors.length} errors and ${warnings.length} warnings\n\n`;
  
  // Show first 10 issues
  const toShow = result.diagnostics.slice(0, 10);
  for (const diag of toShow) {
    output += `${basename(result.file)}:${diag.line}:${diag.column} ${diag.severity}: ${diag.message}\n`;
  }
  
  if (result.diagnostics.length > 10) {
    output += `\n... and ${result.diagnostics.length - 10} more issues`;
  }
  
  return output;
}

// CLI interface
if (import.meta.main) {
  const file = process.argv[2];
  
  if (!file) {
    console.error("Usage: file-checker.ts <file>");
    process.exit(1);
  }
  
  const result = await checkFile(file);
  
  if (result) {
    const formatted = formatDiagnostics(result);
    if (formatted) {
      console.log(formatted);
      process.exit(1);
    } else {
      console.log(`No issues found in ${file}`);
    }
  } else {
    console.log(`Cannot check ${file} (unsupported type or file not found)`);
  }
}
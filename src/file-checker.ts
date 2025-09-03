#!/usr/bin/env bun
/**
 * File-Based Type Checker V2 - With timeout handling
 * 
 * Handles slow commands gracefully with configurable timeouts
 */

import { spawn } from "bun";
import { existsSync } from "fs";
import { dirname, basename, extname, join, relative } from "path";

// Project root detection
function findProjectRoot(filePath: string): string {
  let dir = dirname(filePath);
  
  while (dir !== "/" && dir.length > 1) {
    // Check for common project markers
    if (existsSync(join(dir, ".git")) ||
        existsSync(join(dir, "package.json")) ||
        existsSync(join(dir, "bun.lockb")) ||        // Bun projects
        existsSync(join(dir, "tsconfig.json")) ||     // TypeScript projects
        existsSync(join(dir, "pyproject.toml")) ||
        existsSync(join(dir, "go.mod")) ||
        existsSync(join(dir, "Cargo.toml")) ||
        existsSync(join(dir, "pom.xml")) ||
        existsSync(join(dir, "build.gradle")) ||
        existsSync(join(dir, "composer.json")) ||
        existsSync(join(dir, "mix.exs")) ||
        existsSync(join(dir, "main.tf"))) {
      return dir;
    }
    dir = dirname(dir);
  }
  
  return dirname(filePath); // fallback to file directory
}

// Configurable timeout (default 5 seconds)
const CHECKER_TIMEOUT = parseInt(process.env.CLAUDE_LSP_TIMEOUT || "5000");
const FAST_TIMEOUT = 2000; // 2 seconds for simpler checks

export interface FileCheckResult {
  file: string;
  tool: string;
  diagnostics: Array<{
    line: number;
    column: number;
    severity: "error" | "warning" | "info";
    message: string;
  }>;
  timedOut?: boolean;
}

/**
 * Run command with timeout and automatic kill
 */
async function runCommand(
  args: string[],
  timeout: number = CHECKER_TIMEOUT,
  env?: Record<string, string>,
  cwd?: string
): Promise<{ stdout: string; stderr: string; timedOut: boolean }> {
  const proc = spawn(args, {
    stdio: ["ignore", "pipe", "pipe"],
    env: env ? { ...process.env, ...env } : process.env,
    cwd: cwd || process.cwd()
  });

  const timeoutId = setTimeout(() => {
    proc.kill(9); // SIGKILL to ensure termination
  }, timeout);

  try {
    // Read streams with timeout
    const stdoutPromise = new Response(proc.stdout).text();
    const stderrPromise = new Response(proc.stderr).text();
    
    // Race against timeout
    const result = await Promise.race([
      Promise.all([stdoutPromise, stderrPromise, proc.exited]),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), timeout))
    ]);

    clearTimeout(timeoutId);

    if (result === null) {
      // Timed out
      proc.kill(9);
      return { stdout: "", stderr: "Command timed out", timedOut: true };
    }

    const [stdout, stderr] = result;
    return { stdout, stderr, timedOut: false };
  } catch (error) {
    clearTimeout(timeoutId);
    proc.kill(9);
    return { stdout: "", stderr: String(error), timedOut: true };
  }
}

/**
 * Check a single file with timeout protection
 */
export async function checkFile(filePath: string): Promise<FileCheckResult | null> {
  if (!existsSync(filePath)) {
    return null;
  }

  const projectRoot = findProjectRoot(filePath);
  const relativePath = relative(projectRoot, filePath);

  const ext = extname(filePath).toLowerCase();
  const result: FileCheckResult = {
    file: relativePath, // Use relative path from project root
    tool: "unknown",
    diagnostics: []
  };

  switch (ext) {
    case ".ts":
    case ".tsx":
    case ".mts":
    case ".cts":
      return await checkTypeScript(filePath);
    
    
    case ".py":
    case ".pyi":
      return await checkPython(filePath);
    
    case ".go":
      return await checkGo(filePath);
    
    case ".rs":
      return await checkRust(filePath);
    
    case ".java":
      return await checkJava(filePath);
    
    case ".cpp":
    case ".cxx":
    case ".cc":
    case ".c":
      return await checkCpp(filePath);
    
    case ".php":
      return await checkPhp(filePath);
    
    case ".scala":
      return await checkScala(filePath);
    
    case ".lua":
      return await checkLua(filePath);
    
    case ".ex":
    case ".exs":
      return await checkElixir(filePath);
    
    case ".tf":
      return await checkTerraform(filePath);
      
    default:
      return null;
  }
}

// Language-specific checkers with timeout

async function checkTypeScript(file: string): Promise<FileCheckResult> {
  const projectRoot = findProjectRoot(file);
  const relativePath = relative(projectRoot, file);
  
  const result: FileCheckResult = {
    file: relativePath,
    tool: "tsc",
    diagnostics: []
  };

  // Just specify the file directly - TypeScript will use tsconfig.json from parent directories automatically
  const tscArgs = ["tsc", "--noEmit", "--pretty", "false", file];

  const { stdout, stderr, timedOut } = await runCommand(
    tscArgs,
    CHECKER_TIMEOUT,
    { NO_COLOR: "1" },
    projectRoot
  );

  if (timedOut) {
    result.timedOut = true;
    result.diagnostics.push({
      line: 1,
      column: 1,
      severity: "warning",
      message: `TypeScript check timed out after ${CHECKER_TIMEOUT}ms`
    });
    return result;
  }

  // Parse TypeScript output
  const output = stderr || stdout;
  const lines = output.split("\n");
  
  for (const line of lines) {
    const match = line.match(/^(.+?)\((\d+),(\d+)\): (error|warning) TS\d+: (.+)$/);
    if (match && match[1].includes(basename(file))) {
      let message = match[5];
      // Clean up absolute paths in error messages
      message = message.replace(new RegExp(projectRoot.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), '');
      message = message.replace(/^\/+/, ''); // Remove leading slashes
      
      result.diagnostics.push({
        line: parseInt(match[2]),
        column: parseInt(match[3]),
        severity: match[4] as "error" | "warning",
        message: message
      });
    }
  }

  return result;
}


async function checkPython(file: string): Promise<FileCheckResult> {
  const projectRoot = findProjectRoot(file);
  const relativePath = relative(projectRoot, file);
  
  const result: FileCheckResult = {
    file: relativePath,
    tool: "pyright",
    diagnostics: []
  };

  // Check for Python project configuration
  const hasPyrightConfig = existsSync(join(projectRoot, "pyrightconfig.json"));
  const hasPyprojectToml = existsSync(join(projectRoot, "pyproject.toml"));
  const hasSetupCfg = existsSync(join(projectRoot, "setup.cfg"));
  
  // Build pyright arguments based on project configuration
  const pyrightArgs = ["pyright", "--outputjson"];
  
  if (hasPyrightConfig || hasPyprojectToml) {
    // Use project configuration
    pyrightArgs.push("--project", projectRoot);
  }
  
  pyrightArgs.push(relativePath);

  // Try pyright with longer timeout (it can be slow on first run)
  const { stdout, timedOut } = await runCommand(
    pyrightArgs,
    CHECKER_TIMEOUT * 2, // 10 seconds for Python
    { PATH: `/Users/steven_chong/.bun/bin:${process.env.PATH}` },
    projectRoot
  );

  if (timedOut) {
    // Try faster mypy as fallback
    const mypyResult = await runCommand(
      ["mypy", "--no-error-summary", "--show-column-numbers", file],
      FAST_TIMEOUT
    );
    
    if (!mypyResult.timedOut) {
      result.tool = "mypy";
      const lines = mypyResult.stdout.split("\n");
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
    } else {
      result.timedOut = true;
      result.diagnostics.push({
        line: 1,
        column: 1,
        severity: "warning",
        message: "Python check timed out"
      });
    }
    return result;
  }

  // Parse pyright output
  try {
    const pyrightResult = JSON.parse(stdout);
    for (const diag of pyrightResult.generalDiagnostics || []) {
      if (diag.file.includes(basename(file))) {
        result.diagnostics.push({
          line: (diag.range?.start?.line || 0) + 1,
          column: (diag.range?.start?.character || 0) + 1,
          severity: diag.severity === "error" ? "error" : "warning",
          message: diag.message
        });
      }
    }
  } catch {
    // Parsing failed
  }

  return result;
}

async function checkGo(file: string): Promise<FileCheckResult> {
  const projectRoot = findProjectRoot(file);
  const relativePath = relative(projectRoot, file);
  
  const result: FileCheckResult = {
    file: relativePath,
    tool: "go",
    diagnostics: []
  };

  // Check if we're in a Go module
  const hasGoMod = existsSync(join(projectRoot, "go.mod"));
  
  // Use go vet for better static analysis instead of go run
  const goArgs = hasGoMod 
    ? ["go", "vet", relativePath]  // Use module-aware mode
    : ["go", "vet", file];         // Fallback to direct file

  const { stderr, stdout, timedOut } = await runCommand(
    goArgs,
    FAST_TIMEOUT,
    {},
    hasGoMod ? projectRoot : undefined
  );

  if (timedOut) {
    result.timedOut = true;
    return result;
  }

  // Parse go vet output
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

  return result;
}

async function checkRust(file: string): Promise<FileCheckResult> {
  const result: FileCheckResult = {
    file,
    tool: "rustc",
    diagnostics: []
  };

  // Rust can be slow to compile
  const { stderr, timedOut } = await runCommand(
    ["rustc", "--error-format=json", "--edition", "2021", file],
    CHECKER_TIMEOUT * 2 // 10 seconds for Rust
  );

  if (timedOut) {
    result.timedOut = true;
    result.diagnostics.push({
      line: 1,
      column: 1,
      severity: "warning",
      message: "Rust check timed out"
    });
    return result;
  }

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
      // Not JSON
    }
  }

  return result;
}

async function checkJava(file: string): Promise<FileCheckResult> {
  const projectRoot = findProjectRoot(file);
  const relativePath = relative(projectRoot, file);
  
  const result: FileCheckResult = {
    file: relativePath,
    tool: "javac",
    diagnostics: []
  };

  // Check for Java project files
  const hasPom = existsSync(join(projectRoot, "pom.xml"));
  const hasGradle = existsSync(join(projectRoot, "build.gradle")) || 
                    existsSync(join(projectRoot, "build.gradle.kts"));
  
  // Build javac arguments
  const javacArgs = ["javac", "-Xlint:all", "-d", "/tmp"];
  
  // Add classpath for common directories if in a project
  if (hasPom || hasGradle) {
    const srcDir = join(projectRoot, "src", "main", "java");
    const targetDir = join(projectRoot, "target", "classes");
    const buildDir = join(projectRoot, "build", "classes", "java", "main");
    
    const classpath = [];
    if (existsSync(targetDir)) classpath.push(targetDir); // Maven
    if (existsSync(buildDir)) classpath.push(buildDir);   // Gradle
    if (existsSync(srcDir)) classpath.push(srcDir);
    
    if (classpath.length > 0) {
      javacArgs.push("-cp", classpath.join(":"));
    }
  }
  
  javacArgs.push(file); // Use full path for javac

  // Java compilation can be slow
  const { stderr, timedOut } = await runCommand(
    javacArgs,
    CHECKER_TIMEOUT,
    {},
    hasPom || hasGradle ? projectRoot : undefined
  );

  if (timedOut) {
    result.timedOut = true;
    result.diagnostics.push({
      line: 1,
      column: 1,
      severity: "warning",
      message: "Java check timed out"
    });
    return result;
  }

  // Parse javac output
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

  return result;
}

async function checkCpp(file: string): Promise<FileCheckResult> {
  const result: FileCheckResult = {
    file,
    tool: "gcc",
    diagnostics: []
  };

  const { stderr, timedOut } = await runCommand(
    ["gcc", "-fsyntax-only", "-Wall", file],
    CHECKER_TIMEOUT
  );

  if (timedOut) {
    result.timedOut = true;
    result.diagnostics.push({
      line: 1,
      column: 1,
      severity: "warning",
      message: "C++ check timed out"
    });
    return result;
  }

  // Parse GCC output
  const lines = stderr.split("\n");
  for (const line of lines) {
    // Match both regular errors/warnings and fatal errors
    const match = line.match(/^.+?:(\d+):(\d+): (error|warning|fatal error): (.+)$/);
    if (match) {
      result.diagnostics.push({
        line: parseInt(match[1]),
        column: parseInt(match[2]),
        severity: match[3].includes("error") ? "error" : "warning",
        message: match[4]
      });
    }
  }

  return result;
}

async function checkPhp(file: string): Promise<FileCheckResult> {
  const result: FileCheckResult = {
    file,
    tool: "php",
    diagnostics: []
  };

  const { stderr, timedOut } = await runCommand(
    ["php", "-l", file],
    FAST_TIMEOUT
  );

  if (timedOut) {
    result.timedOut = true;
    return result;
  }

  // Parse PHP lint output
  const lines = stderr.split("\n");
  for (const line of lines) {
    const match = line.match(/Parse error: (.+) in .+ on line (\d+)/);
    if (match) {
      result.diagnostics.push({
        line: parseInt(match[2]),
        column: 1,
        severity: "error",
        message: match[1]
      });
    }
  }

  return result;
}

async function checkScala(file: string): Promise<FileCheckResult> {
  const projectRoot = findProjectRoot(file);
  const relativePath = relative(projectRoot, file);
  
  const result: FileCheckResult = {
    file: relativePath,
    tool: "scalac",
    diagnostics: []
  };

  // Check if this is an sbt or gradle project
  const hasBuildSbt = existsSync(join(projectRoot, "build.sbt"));
  const hasBuildGradle = existsSync(join(projectRoot, "build.gradle"));
  
  // For Scala projects with build files, we can't effectively check single files
  // because scalac needs the full classpath and dependencies
  if (hasBuildSbt || hasBuildGradle) {
    // Skip checking - return no diagnostics for now
    // In a real setup, we'd need to use sbt/gradle or metals LSP
    return result;
  }

  // Only run scalac for simple single-file Scala scripts
  const { stderr, timedOut } = await runCommand(
    ["scalac", "-explain", file],
    CHECKER_TIMEOUT * 2 // Scala can be slow
  );

  if (timedOut) {
    result.timedOut = true;
    result.diagnostics.push({
      line: 1,
      column: 1,
      severity: "warning",
      message: "Scala check timed out"
    });
    return result;
  }

  // Parse Scala compiler output (format: "-- [E006] Not Found Error: file.scala:3:13")
  const lines = stderr.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Remove ANSI color codes and match Scala 3 error format
    const cleanLine = line.replace(/\x1b\[[0-9;]*m/g, '');
    const match = cleanLine.match(/-- \[E\d+\] (.+): .+?:(\d+):(\d+)/);
    if (match) {
      // Get the detailed error message from the next few lines
      let message = match[1]; // Start with error type
      
      // Look for the actual error description in subsequent lines
      for (let j = i + 1; j < Math.min(i + 6, lines.length); j++) {
        const detailLine = lines[j].replace(/\x1b\[[0-9;]*m/g, ''); // Remove ANSI codes
        const detailMatch = detailLine.match(/\s*\|\s*(.+)$/);
        if (detailMatch) {
          const content = detailMatch[1].trim();
          // Skip lines with just syntax highlighting (contains only code) or arrow indicators
          if (content && !content.match(/^\^+$/) && !content.match(/^(import|class|def|val|var|if|else|for|while|try|catch)\s/)) {
            // This looks like an actual error message
            if (content.includes("not a member of") || content.includes("Not found:") || content.includes("cannot be applied")) {
              message = content;
              break;
            }
          }
        }
      }
      
      result.diagnostics.push({
        line: parseInt(match[2]),
        column: parseInt(match[3]),
        severity: "error",
        message: message
      });
    }
  }

  return result;
}

async function checkLua(file: string): Promise<FileCheckResult> {
  const result: FileCheckResult = {
    file,
    tool: "luac",
    diagnostics: []
  };

  // Use luac -p for syntax checking (lua doesn't have a -c flag)
  const { stderr, timedOut } = await runCommand(
    ["luac", "-p", file],
    FAST_TIMEOUT
  );

  if (timedOut) {
    result.timedOut = true;
    return result;
  }

  // Parse luac output format: luac: file.lua:line: message
  const lines = stderr.split("\n");
  for (const line of lines) {
    const match = line.match(/luac: .+?:(\d+): (.+)/);
    if (match) {
      result.diagnostics.push({
        line: parseInt(match[1]),
        column: 1,
        severity: "error",
        message: match[2]
      });
    }
  }

  return result;
}

async function checkElixir(file: string): Promise<FileCheckResult> {
  const result: FileCheckResult = {
    file,
    tool: "elixir",
    diagnostics: []
  };

  const projectRoot = findProjectRoot(file);
  const relativePath = relative(projectRoot, file);
  
  const { stderr, timedOut } = await runCommand(
    ["elixir", relativePath],
    CHECKER_TIMEOUT,
    undefined,
    projectRoot
  );

  if (timedOut) {
    result.timedOut = true;
    result.diagnostics.push({
      line: 1,
      column: 1,
      severity: "warning", 
      message: "Elixir check timed out"
    });
    return result;
  }

  // Parse Elixir output
  const lines = stderr.split("\n");
  for (const line of lines) {
    // Match the new error format: "error: message" followed by location
    if (line.trim().startsWith("error:")) {
      const errorMessage = line.replace(/^\s*error:\s*/, "");
      
      // Look for location info in subsequent lines
      for (let i = lines.indexOf(line) + 1; i < lines.length; i++) {
        const locationLine = lines[i];
        const locationMatch = locationLine.match(/└─\s+(.+?):(\d+):(\d+):/);
        if (locationMatch) {
          result.diagnostics.push({
            line: parseInt(locationMatch[2]),
            column: parseInt(locationMatch[3]),
            severity: "error",
            message: errorMessage
          });
          break;
        }
      }
    }
    
    // Also match the old format for backward compatibility
    const oldMatch = line.match(/\*\* \((CompileError|SyntaxError)\) (.+?):(\d+): (.+)/);
    if (oldMatch) {
      result.diagnostics.push({
        line: parseInt(oldMatch[3]),
        column: 1,
        severity: "error",
        message: oldMatch[4]
      });
    }
  }

  return result;
}

async function checkTerraform(file: string): Promise<FileCheckResult> {
  const result: FileCheckResult = {
    file,
    tool: "terraform",
    diagnostics: []
  };

  const { stdout, stderr, timedOut } = await runCommand(
    ["terraform", "fmt", "-check", "-diff", file],
    FAST_TIMEOUT
  );

  if (timedOut) {
    result.timedOut = true;
    return result;
  }

  // Terraform fmt outputs diff to stderr when formatting issues found
  if (stderr.trim() || stdout.trim()) {
    result.diagnostics.push({
      line: 1,
      column: 1,
      severity: "warning",
      message: "Formatting issues detected"
    });
  }

  return result;
}

// Format diagnostics for output
export function formatDiagnostics(result: FileCheckResult): string {
  if (!result || result.diagnostics.length === 0) {
    if (result?.timedOut) {
      return `[[system-message]]:{"summary":"check timed out after ${CHECKER_TIMEOUT}ms"}`;
    }
    return "";
  }

  const errors = result.diagnostics.filter(d => d.severity === "error");
  const warnings = result.diagnostics.filter(d => d.severity === "warning");
  
  // Build summary - only show non-zero counts
  const summaryParts = [];
  if (errors.length > 0) summaryParts.push(`${errors.length} error(s)`);
  if (warnings.length > 0) summaryParts.push(`${warnings.length} warnings`);
  
  const jsonResult = {
    diagnostics: result.diagnostics.slice(0, 5), // Show at most 5 items
    summary: summaryParts.length > 0 ? summaryParts.join(", ") : "no errors or warnings"
  };
  
  if (result.timedOut) {
    jsonResult.summary += " (partial results due to timeout)";
  }
  
  return `[[system-message]]:${JSON.stringify(jsonResult)}`;
}

// CLI for testing
if (import.meta.main) {
  const file = process.argv[2];
  
  if (!file) {
    console.error("Usage: file-checker-v2.ts <file>");
    console.error(`Timeout: ${CHECKER_TIMEOUT}ms (set CLAUDE_LSP_TIMEOUT env var to change)`);
    process.exit(1);
  }
  
  console.log(`Checking ${file} (timeout: ${CHECKER_TIMEOUT}ms)...`);
  const start = Date.now();
  
  const result = await checkFile(file);
  const elapsed = Date.now() - start;
  
  if (result) {
    const formatted = formatDiagnostics(result);
    if (formatted) {
      console.log(formatted);
      console.log(`\nCompleted in ${elapsed}ms`);
      // Exit code 2 for errors/warnings found (matches expectation)
      process.exit(2);
    } else {
      console.log(`✅ No issues found (${elapsed}ms)`);
    }
  } else {
    console.log(`Cannot check ${file} (unsupported type or file not found)`);
  }
}
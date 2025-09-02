#!/usr/bin/env bun
/**
 * Direct Type Checker - Simpler alternative to LSP
 * 
 * Directly invokes language-specific type checkers without LSP overhead
 */

import { spawn } from "bun";
import { existsSync } from "fs";
import { join, relative } from "path";
import { logger } from "./utils/logger";

export interface DirectCheckResult {
  tool: string;
  command: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  diagnostics: Array<{
    file: string;
    line: number;
    column: number;
    severity: "error" | "warning" | "info";
    message: string;
  }>;
}

/**
 * Language-specific type checker configurations
 */
const TYPE_CHECKERS = {
  typescript: {
    detect: ["tsconfig.json", "package.json"],
    extensions: [".ts", ".tsx", ".mts", ".cts"],
    commands: [
      {
        tool: "tsc",
        command: ["tsc", "--noEmit", "--pretty", "false"],
        parser: parseTscOutput
      },
      {
        tool: "eslint",
        command: ["eslint", ".", "--format", "json", "--ext", ".ts,.tsx"],
        parser: parseEslintOutput,
        optional: true
      }
    ]
  },
  
  javascript: {
    detect: ["package.json", ".eslintrc.json", ".eslintrc.js"],
    extensions: [".js", ".jsx", ".mjs", ".cjs"],
    commands: [
      {
        tool: "eslint",
        command: ["eslint", ".", "--format", "json"],
        parser: parseEslintOutput
      }
    ]
  },
  
  python: {
    detect: ["pyproject.toml", "setup.py", "requirements.txt", ".python-version"],
    extensions: [".py", ".pyi"],
    commands: [
      {
        tool: "pyright",
        command: ["pyright", "--outputjson"],
        parser: parsePyrightOutput
      },
      {
        tool: "mypy",
        command: ["mypy", ".", "--output", "json"],
        parser: parseMypyOutput,
        fallback: true
      },
      {
        tool: "ruff",
        command: ["ruff", "check", ".", "--format", "json"],
        parser: parseRuffOutput,
        optional: true
      }
    ]
  },
  
  go: {
    detect: ["go.mod", "go.sum"],
    extensions: [".go"],
    commands: [
      {
        tool: "go",
        command: ["go", "vet", "./..."],
        parser: parseGoVetOutput
      },
      {
        tool: "golangci-lint",
        command: ["golangci-lint", "run", "--out-format", "json"],
        parser: parseGolangciOutput,
        optional: true
      }
    ]
  },
  
  rust: {
    detect: ["Cargo.toml", "Cargo.lock"],
    extensions: [".rs"],
    commands: [
      {
        tool: "cargo",
        command: ["cargo", "check", "--message-format", "json"],
        parser: parseCargoOutput
      },
      {
        tool: "clippy",
        command: ["cargo", "clippy", "--message-format", "json"],
        parser: parseCargoOutput,
        optional: true
      }
    ]
  },
  
  java: {
    detect: ["pom.xml", "build.gradle", "build.gradle.kts", ".classpath"],
    extensions: [".java"],
    commands: [
      {
        tool: "javac",
        command: ["javac", "-Xlint:all", "-d", "/tmp/javac-out"],
        parser: parseJavacOutput,
        needsFiles: true // Will append file list
      }
    ]
  }
};

/**
 * Run direct type checking for a project
 */
export async function runDirectCheck(projectRoot: string): Promise<DirectCheckResult[]> {
  const results: DirectCheckResult[] = [];
  
  // Detect which languages are present
  const detectedLanguages = detectLanguages(projectRoot);
  
  if (detectedLanguages.length === 0) {
    logger.debug("No supported languages detected", { projectRoot });
    return results;
  }
  
  logger.debug("Detected languages", { languages: detectedLanguages, projectRoot });
  
  // Run checkers for each detected language
  for (const lang of detectedLanguages) {
    const config = TYPE_CHECKERS[lang as keyof typeof TYPE_CHECKERS];
    if (!config) continue;
    
    for (const checker of config.commands) {
      try {
        // Skip optional tools if not installed
        if (checker.optional && !await isToolInstalled(checker.tool)) {
          continue;
        }
        
        // Use fallback if primary tool not available
        if (checker.fallback && results.some(r => r.exitCode === 0)) {
          continue;
        }
        
        let command = [...checker.command];
        
        // For tools that need file lists (like javac)
        if (checker.needsFiles) {
          const files = await findFiles(projectRoot, config.extensions);
          if (files.length === 0) continue;
          command.push(...files);
        }
        
        logger.debug(`Running ${checker.tool}`, { command: command.join(" "), projectRoot });
        
        const proc = spawn(command, {
          cwd: projectRoot,
          stdio: ["ignore", "pipe", "pipe"],
          env: { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0" }
        });
        
        const stdout = await new Response(proc.stdout).text();
        const stderr = await new Response(proc.stderr).text();
        const exitCode = await proc.exited;
        
        const diagnostics = checker.parser(stdout || stderr, projectRoot);
        
        results.push({
          tool: checker.tool,
          command: command.join(" "),
          exitCode,
          stdout,
          stderr,
          diagnostics
        });
        
        logger.debug(`${checker.tool} found ${diagnostics.length} issues`, { 
          errors: diagnostics.filter(d => d.severity === "error").length,
          warnings: diagnostics.filter(d => d.severity === "warning").length
        });
        
      } catch (error) {
        logger.error(`Failed to run ${checker.tool}`, { error, projectRoot });
      }
    }
  }
  
  return results;
}

/**
 * Detect which languages are present in the project
 */
function detectLanguages(projectRoot: string): string[] {
  const detected: string[] = [];
  
  for (const [lang, config] of Object.entries(TYPE_CHECKERS)) {
    // Check for language-specific project files
    for (const marker of config.detect) {
      if (existsSync(join(projectRoot, marker))) {
        detected.push(lang);
        break;
      }
    }
  }
  
  return detected;
}

/**
 * Check if a tool is installed
 */
async function isToolInstalled(tool: string): Promise<boolean> {
  try {
    const proc = spawn(["which", tool], { stdio: ["ignore", "pipe", "ignore"] });
    await proc.exited;
    return proc.exitCode === 0;
  } catch {
    return false;
  }
}

/**
 * Find files with specific extensions
 */
async function findFiles(projectRoot: string, extensions: string[]): Promise<string[]> {
  const files: string[] = [];
  const { readdir } = await import("fs/promises");
  
  async function scan(dir: string) {
    // Skip common directories
    if (dir.includes("node_modules") || dir.includes(".git")) return;
    
    const entries = await readdir(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      
      if (entry.isDirectory()) {
        await scan(fullPath);
      } else if (entry.isFile()) {
        if (extensions.some(ext => entry.name.endsWith(ext))) {
          files.push(relative(projectRoot, fullPath));
        }
      }
    }
  }
  
  await scan(projectRoot);
  return files;
}

// Parser functions for different tools

function parseTscOutput(output: string, projectRoot: string): DirectCheckResult["diagnostics"] {
  const diagnostics: DirectCheckResult["diagnostics"] = [];
  const lines = output.split("\n");
  
  for (const line of lines) {
    // TypeScript error format: file(line,col): error TS2304: message
    const match = line.match(/^(.+?)\((\d+),(\d+)\): (error|warning) TS\d+: (.+)$/);
    if (match) {
      diagnostics.push({
        file: match[1],
        line: parseInt(match[2]),
        column: parseInt(match[3]),
        severity: match[4] as "error" | "warning",
        message: match[5]
      });
    }
  }
  
  return diagnostics;
}

function parseEslintOutput(output: string, projectRoot: string): DirectCheckResult["diagnostics"] {
  const diagnostics: DirectCheckResult["diagnostics"] = [];
  
  try {
    const results = JSON.parse(output);
    for (const file of results) {
      for (const msg of file.messages || []) {
        diagnostics.push({
          file: relative(projectRoot, file.filePath),
          line: msg.line || 1,
          column: msg.column || 1,
          severity: msg.severity === 2 ? "error" : "warning",
          message: `${msg.message} (${msg.ruleId || "unknown"})`
        });
      }
    }
  } catch {
    // Fallback to line parsing if JSON fails
  }
  
  return diagnostics;
}

function parsePyrightOutput(output: string, projectRoot: string): DirectCheckResult["diagnostics"] {
  const diagnostics: DirectCheckResult["diagnostics"] = [];
  
  try {
    const result = JSON.parse(output);
    for (const diagnostic of result.generalDiagnostics || []) {
      diagnostics.push({
        file: relative(projectRoot, diagnostic.file),
        line: diagnostic.range?.start?.line || 1,
        column: diagnostic.range?.start?.character || 1,
        severity: diagnostic.severity === "error" ? "error" : "warning",
        message: diagnostic.message
      });
    }
  } catch {
    // Fallback to text parsing
    const lines = output.split("\n");
    for (const line of lines) {
      const match = line.match(/^\s*(.+?):(\d+):(\d+) - (error|warning): (.+)$/);
      if (match) {
        diagnostics.push({
          file: match[1],
          line: parseInt(match[2]),
          column: parseInt(match[3]),
          severity: match[4] as "error" | "warning",
          message: match[5]
        });
      }
    }
  }
  
  return diagnostics;
}

function parseMypyOutput(output: string, projectRoot: string): DirectCheckResult["diagnostics"] {
  const diagnostics: DirectCheckResult["diagnostics"] = [];
  
  // mypy format: file:line: error: message
  const lines = output.split("\n");
  for (const line of lines) {
    const match = line.match(/^(.+?):(\d+):\s*(error|warning|note):\s*(.+)$/);
    if (match) {
      diagnostics.push({
        file: match[1],
        line: parseInt(match[2]),
        column: 1,
        severity: match[3] === "error" ? "error" : "warning",
        message: match[4]
      });
    }
  }
  
  return diagnostics;
}

function parseRuffOutput(output: string, projectRoot: string): DirectCheckResult["diagnostics"] {
  const diagnostics: DirectCheckResult["diagnostics"] = [];
  
  try {
    const results = JSON.parse(output);
    for (const issue of results) {
      diagnostics.push({
        file: relative(projectRoot, issue.filename),
        line: issue.location?.row || 1,
        column: issue.location?.column || 1,
        severity: "warning", // Ruff is a linter, not type checker
        message: `${issue.message} (${issue.code})`
      });
    }
  } catch {
    // Text fallback
  }
  
  return diagnostics;
}

function parseGoVetOutput(output: string, projectRoot: string): DirectCheckResult["diagnostics"] {
  const diagnostics: DirectCheckResult["diagnostics"] = [];
  
  // go vet format: file:line:col: message
  const lines = output.split("\n");
  for (const line of lines) {
    const match = line.match(/^(.+?):(\d+):(\d+):\s*(.+)$/);
    if (match) {
      diagnostics.push({
        file: match[1],
        line: parseInt(match[2]),
        column: parseInt(match[3]),
        severity: "error",
        message: match[4]
      });
    }
  }
  
  return diagnostics;
}

function parseGolangciOutput(output: string, projectRoot: string): DirectCheckResult["diagnostics"] {
  const diagnostics: DirectCheckResult["diagnostics"] = [];
  
  try {
    const result = JSON.parse(output);
    for (const issue of result.Issues || []) {
      diagnostics.push({
        file: issue.Pos?.Filename || "",
        line: issue.Pos?.Line || 1,
        column: issue.Pos?.Column || 1,
        severity: issue.Severity === "error" ? "error" : "warning",
        message: `${issue.Text} (${issue.FromLinter})`
      });
    }
  } catch {
    // Fallback
  }
  
  return diagnostics;
}

function parseCargoOutput(output: string, projectRoot: string): DirectCheckResult["diagnostics"] {
  const diagnostics: DirectCheckResult["diagnostics"] = [];
  
  // Cargo outputs JSON lines
  const lines = output.split("\n");
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const msg = JSON.parse(line);
      if (msg.reason === "compiler-message" && msg.message) {
        const span = msg.message.spans?.[0];
        if (span) {
          diagnostics.push({
            file: relative(projectRoot, span.file_name),
            line: span.line_start || 1,
            column: span.column_start || 1,
            severity: msg.message.level === "error" ? "error" : "warning",
            message: msg.message.message
          });
        }
      }
    } catch {
      // Skip non-JSON lines
    }
  }
  
  return diagnostics;
}

function parseJavacOutput(output: string, projectRoot: string): DirectCheckResult["diagnostics"] {
  const diagnostics: DirectCheckResult["diagnostics"] = [];
  
  // javac format: file:line: error: message
  const lines = output.split("\n");
  for (const line of lines) {
    const match = line.match(/^(.+?):(\d+):\s*(error|warning):\s*(.+)$/);
    if (match) {
      diagnostics.push({
        file: match[1],
        line: parseInt(match[2]),
        column: 1,
        severity: match[3] as "error" | "warning",
        message: match[4]
      });
    }
  }
  
  return diagnostics;
}

// CLI interface
if (import.meta.main) {
  const projectRoot = process.argv[2] || process.cwd();
  
  console.log(`Running direct type checking for: ${projectRoot}`);
  const results = await runDirectCheck(projectRoot);
  
  let totalErrors = 0;
  let totalWarnings = 0;
  
  for (const result of results) {
    const errors = result.diagnostics.filter(d => d.severity === "error").length;
    const warnings = result.diagnostics.filter(d => d.severity === "warning").length;
    
    totalErrors += errors;
    totalWarnings += warnings;
    
    if (errors > 0 || warnings > 0) {
      console.log(`\n${result.tool}: ${errors} errors, ${warnings} warnings`);
      
      // Show first 10 diagnostics
      for (const diag of result.diagnostics.slice(0, 10)) {
        console.log(`  ${diag.file}:${diag.line}:${diag.column} ${diag.severity}: ${diag.message}`);
      }
      
      if (result.diagnostics.length > 10) {
        console.log(`  ... and ${result.diagnostics.length - 10} more`);
      }
    }
  }
  
  console.log(`\nTotal: ${totalErrors} errors, ${totalWarnings} warnings`);
}
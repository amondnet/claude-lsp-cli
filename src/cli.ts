#!/usr/bin/env bun

/**
 * Claude LSP CLI - Simple file-based diagnostics
 * 
 * Usage:
 *   claude-lsp-cli hook <event-type>     - Handle Claude Code hook events
 *   claude-lsp-cli diagnostics <file>    - Check file for errors
 *   claude-lsp-cli disable <language>    - Disable language checking
 *   claude-lsp-cli enable <language>     - Enable language checking
 *   claude-lsp-cli help                  - Show help
 * 
 * Environment Variables:
 *   CLAUDE_LSP_DISABLE=true             - Disable all language checking
 *   CLAUDE_LSP_DISABLE_SCALA=true       - Disable Scala checking only
 *   CLAUDE_LSP_FILTER=false             - Disable all false positive filtering
 *   CLAUDE_LSP_FILTER_SCALA=false       - Disable Scala-specific filtering only
 */

import { resolve, join, dirname } from "path";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { spawn } from "bun";
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
  
  // Check tool response output for file paths (e.g., from Bash commands)
  if (hookData?.tool_response?.output) {
    const output = hookData.tool_response.output;
    const fileRegex = /(?:^|\s|["'])([^\s"']*[\/\\]?[^\s"']*\.(?:ts|tsx|py|go|rs|java|c|cpp|php|swift|kt|scala|tf))(?=$|\s|["'])/gmi;
    let match;
    while ((match = fileRegex.exec(output)) !== null) {
      files.push(match[1]);
    }
  }
  
  // Check tool input command for file paths (e.g., Bash commands)
  if (files.length === 0 && hookData?.tool_input?.command) {
    const command = hookData.tool_input.command;
    const fileRegex = /(?:^|\s|["'])([^\s"']*[\/\\]?[^\s"']*\.(?:ts|tsx|py|go|rs|java|c|cpp|php|swift|kt|scala|tf))(?=$|\s|["'])/gmi;
    let match;
    while ((match = fileRegex.exec(command)) !== null) {
      files.push(match[1]);
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
      
      // Debug: log files being checked
      if (process.env.DEBUG === "true" || process.env.DEBUG_EXTRACTION === "true") {
        console.error("Extracted file paths:", filePaths);
        console.error("Absolute paths to check:", absolutePaths);
      }
      
      const results = await Promise.all(
        absolutePaths.map(absolutePath => checkFile(absolutePath))
      );
      
      let allDiagnostics = [];
      let hasErrors = false;
      
      for (let i = 0; i < results.length; i++) {
        const result = results[i];
        const absolutePath = absolutePaths[i];
        
        // Skip if checking was disabled (result is null) or file type not supported
        if (!result) {
          continue;
        }
        
        if (result.diagnostics.length > 0) {
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
        if (warnings.length > 0) summaryParts.push(`${warnings.length} warning(s)`);
        
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
  hook <event>             Handle Claude Code hook events
  diagnostics <file>       Check individual file for errors/warnings
  disable <language>       Disable language checking globally (e.g. disable scala)
  enable <language>        Enable language checking globally (e.g. enable scala)
  help                     Show this help message

Global Config Location: ~/.claude/lsp-config.json

Examples:
  claude-lsp-cli diagnostics src/index.ts
  claude-lsp-cli hook PostToolUse

Language Support Status:`);

  // Check if there's a config file and read disabled languages
  const configPath = join(process.cwd(), ".claude", "lsp-config.json");
  let disabledLanguages = new Set<string>();
  let globalDisabled = false;
  
  try {
    if (existsSync(configPath)) {
      const config = JSON.parse(readFileSync(configPath, "utf8"));
      globalDisabled = config.disable === true;
      if (config.disableScala === true) disabledLanguages.add("Scala");
      if (config.disableTypeScript === true) disabledLanguages.add("TypeScript");
      if (config.disablePython === true) disabledLanguages.add("Python");
      if (config.disableGo === true) disabledLanguages.add("Go");
      if (config.disableRust === true) disabledLanguages.add("Rust");
      if (config.disableJava === true) disabledLanguages.add("Java");
      if (config.disableCpp === true) disabledLanguages.add("C/C++");
      if (config.disablePhp === true) disabledLanguages.add("PHP");
      if (config.disableLua === true) disabledLanguages.add("Lua");
      if (config.disableElixir === true) disabledLanguages.add("Elixir");
      if (config.disableTerraform === true) disabledLanguages.add("Terraform");
    }
  } catch (e) {
    // Ignore config parsing errors
  }

  if (globalDisabled) {
    console.log("  🚫 All language checking is DISABLED via config");
  }

  // Check which language tools are available (matching actual file checker commands)
  const languages = [
    { name: "TypeScript", code: "typescript", command: "tsc", versionArg: "--version", install: "npm install -g typescript" },
    { name: "Python", code: "python", command: "pyright", versionArg: "--version", install: "npm install -g pyright" },
    { name: "Go", code: "go", command: "go", versionArg: "version", install: "Install Go from https://golang.org" },
    { name: "Rust", code: "rust", command: "rustc", versionArg: "--version", install: "Install Rust from https://rustup.rs" },
    { name: "Java", code: "java", command: "javac", versionArg: "-version", install: "Install Java JDK" },
    { name: "C/C++", code: "cpp", command: "gcc", versionArg: "--version", install: "Install GCC or Clang" },
    { name: "PHP", code: "php", command: "php", versionArg: "--version", install: "Install PHP" },
    { name: "Scala", code: "scala", command: "scalac", versionArg: "-version", install: "Install Scala" },
    { name: "Lua", code: "lua", command: "luac", versionArg: "-v", install: "Install Lua" },
    { name: "Elixir", code: "elixir", command: "elixir", versionArg: "--version", install: "Install Elixir" },
    { name: "Terraform", code: "terraform", command: "terraform", versionArg: "version", install: "Install Terraform" },
  ];

  // Check all languages in parallel, then display in order
  const checks = languages.map(async (lang) => {
    try {
      const proc = spawn([lang.command, lang.versionArg], { stdout: "ignore", stderr: "ignore" });
      await proc.exited;
      return {
        name: lang.name,
        code: lang.code,
        available: proc.exitCode === 0,
        install: lang.install
      };
    } catch {
      return {
        name: lang.name,
        code: lang.code,
        available: false,
        install: lang.install
      };
    }
  });

  const results = await Promise.all(checks);
  
  // Display results in original order
  for (const result of results) {
    const isDisabled = globalDisabled || disabledLanguages.has(result.name);
    
    if (isDisabled) {
      console.log(`  🚫 ${result.name} (${result.code}): DISABLED via config`);
    } else if (result.available) {
      console.log(`  ✅ ${result.name} (${result.code}): Available`);
    } else {
      console.log(`  ❌ ${result.name} (${result.code}): Not found - ${result.install}`);
    }
  }
  
  // Show config instructions only if there are disabled languages
  if (globalDisabled || disabledLanguages.size > 0) {
    console.log(`
To enable/disable languages use:
  claude-lsp-cli enable <language>     # Enable specific language
  claude-lsp-cli disable <language>    # Disable specific language
  
Examples:
  claude-lsp-cli enable scala
  claude-lsp-cli disable python`);
  }

  console.log(`
Features:
  • Direct tool invocation (no LSP servers)
  • Built-in deduplication  
  • Fast single-file checking
  • Standardized JSON output format`);
}

// Config management functions
function updateConfig(configPath: string, updates: Record<string, any>): void {
  let config: any = {};
  
  // Read existing config
  try {
    if (existsSync(configPath)) {
      config = JSON.parse(readFileSync(configPath, "utf8"));
    }
  } catch (e) {
    // Start with empty config if parsing fails
  }
  
  // Apply updates
  Object.assign(config, updates);
  
  // Ensure directory exists
  const dir = dirname(configPath);
  if (!existsSync(dir)) {
    require("fs").mkdirSync(dir, { recursive: true });
  }
  
  // Write updated config
  writeFileSync(configPath, JSON.stringify(config, null, 2));
}

async function disableLanguage(language: string): Promise<void> {
  const homeDir = process.env.HOME || process.env.USERPROFILE || "";
  const configPath = join(homeDir, ".claude", "lsp-config.json");
  
  // Normalize language names to match what the checker expects
  const langMap: Record<string, string> = {
    'typescript': 'TypeScript',
    'python': 'Python',
    'go': 'Go',
    'rust': 'Rust',
    'java': 'Java',
    'cpp': 'Cpp',
    'c++': 'Cpp',
    'c': 'Cpp',
    'php': 'Php',
    'scala': 'Scala',
    'lua': 'Lua',
    'elixir': 'Elixir',
    'terraform': 'Terraform',
    'all': 'all'
  };
  
  const normalizedLang = langMap[language.toLowerCase()] || language;
  
  if (normalizedLang === 'all') {
    updateConfig(configPath, { disable: true });
    console.log(`✅ Disabled ALL language checking globally`);
  } else {
    const langKey = `disable${normalizedLang}`;
    updateConfig(configPath, { [langKey]: true });
    console.log(`✅ Disabled ${language} checking globally`);
  }
}

async function enableLanguage(language: string): Promise<void> {
  const homeDir = process.env.HOME || process.env.USERPROFILE || "";
  const configPath = join(homeDir, ".claude", "lsp-config.json");
  
  // Normalize language names to match what the checker expects
  const langMap: Record<string, string> = {
    'typescript': 'TypeScript',
    'python': 'Python',
    'go': 'Go',
    'rust': 'Rust',
    'java': 'Java',
    'cpp': 'Cpp',
    'c++': 'Cpp',
    'c': 'Cpp',
    'php': 'Php',
    'scala': 'Scala',
    'lua': 'Lua',
    'elixir': 'Elixir',
    'terraform': 'Terraform',
    'all': 'all'
  };
  
  const normalizedLang = langMap[language.toLowerCase()] || language;
  
  // Read current config
  let config: any = {};
  try {
    if (existsSync(configPath)) {
      config = JSON.parse(readFileSync(configPath, "utf8"));
    }
  } catch (e) {
    // Empty config is fine
  }
  
  // Remove the disable key
  if (normalizedLang === 'all') {
    delete config.disable;
  } else {
    const langKey = `disable${normalizedLang}`;
    delete config[langKey];
  }
  
  // Ensure directory exists
  const dir = dirname(configPath);
  if (!existsSync(dir)) {
    const fs = require("fs");
    fs.mkdirSync(dir, { recursive: true });
  }
  
  // Write updated config (or remove file if empty)
  if (Object.keys(config).length === 0) {
    if (existsSync(configPath)) {
      const fs = require("fs");
      fs.unlinkSync(configPath);
      console.log(`✅ Enabled ${language} checking globally (removed config)`);
    } else {
      console.log(`✅ ${language} checking is already enabled globally`);
    }
  } else {
    writeFileSync(configPath, JSON.stringify(config, null, 2));
    console.log(`✅ Enabled ${language} checking globally`);
  }
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
    if (result === null) {
      // Checking was disabled - exit silently with no output
      process.exit(0);
    } else if (result) {
      if (result.diagnostics.length > 0) {
        const formatted = formatDiagnostics(result);
        if (formatted) {
          console.log(formatted);
        }
      } else {
        // Only say "no errors or warnings" if we actually checked the file
        console.log('[[system-message]]:{"summary":"no errors or warnings"}');
      }
    } else {
      // File type not supported - also exit silently
      process.exit(0);
    }
    
    // CLI always exits 0 (success) - only program errors use non-zero
    process.exit(0);
  } else if (command === "disable") {
    if (args[1]) {
      await disableLanguage(args[1]);
    } else {
      console.log(`Usage: claude-lsp-cli disable <language>

Available languages:
  all         - Disable ALL language checking
  typescript  - TypeScript (.ts, .tsx)
  python      - Python (.py)
  go          - Go (.go)
  rust        - Rust (.rs)
  java        - Java (.java)
  cpp         - C/C++ (.c, .cpp, .cc)
  php         - PHP (.php)
  scala       - Scala (.scala)
  lua         - Lua (.lua)
  elixir      - Elixir (.ex, .exs)
  terraform   - Terraform (.tf)

Example: claude-lsp-cli disable typescript`);
    }
    process.exit(0);
  } else if (command === "enable") {
    if (args[1]) {
      await enableLanguage(args[1]);
    } else {
      console.log(`Usage: claude-lsp-cli enable <language>

Available languages:
  all         - Enable ALL language checking
  typescript  - TypeScript (.ts, .tsx)
  python      - Python (.py)
  go          - Go (.go)
  rust        - Rust (.rs)
  java        - Java (.java)
  cpp         - C/C++ (.c, .cpp, .cc)
  php         - PHP (.php)
  scala       - Scala (.scala)
  lua         - Lua (.lua)
  elixir      - Elixir (.ex, .exs)
  terraform   - Terraform (.tf)

Example: claude-lsp-cli enable typescript`);
    }
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
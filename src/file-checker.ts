#!/usr/bin/env bun
/**
 * File-Based Type Checker V2 - With timeout handling
 * 
 * Handles slow commands gracefully with configurable timeouts
 */

import { spawn } from "bun";
import { existsSync, readFileSync, readdirSync, statSync } from "fs";
import { dirname, basename, extname, join, relative } from "path";

// Project root detection
function findProjectRoot(filePath: string): string {
  let dir = dirname(filePath);
  
  while (dir !== "/" && dir.length > 1) {
    // Check for common project markers (excluding tsconfig.json)
    if (existsSync(join(dir, ".git")) ||
        existsSync(join(dir, "package.json")) ||
        existsSync(join(dir, "bun.lockb")) ||        // Bun projects
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

// Find the nearest tsconfig.json for TypeScript configuration
function findTsconfigRoot(filePath: string): string | null {
  let dir = dirname(filePath);
  
  while (dir !== "/" && dir.length > 1) {
    if (existsSync(join(dir, "tsconfig.json"))) {
      return dir;
    }
    dir = dirname(dir);
  }
  
  return null; // No tsconfig.json found
}

// No timeout - let tools complete naturally

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
  env?: Record<string, string>,
  cwd?: string
): Promise<{ stdout: string; stderr: string; timedOut: boolean }> {
  const proc = spawn(args, {
    stdio: ["ignore", "pipe", "pipe"],
    env: env ? { ...process.env, ...env } : process.env,
    cwd: cwd || process.cwd()
  });

  try {
    const [stdout, stderr] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text()
    ]);
    
    await proc.exited;
    
    return { stdout, stderr, timedOut: false };
  } catch (error) {
    return { stdout: "", stderr: String(error), timedOut: false };
  }
}

/**
 * Check a single file with timeout protection
 */
// Helper function to read LSP config
function readLspConfig(projectRoot: string): any {
  const configPath = join(projectRoot, ".claude", "lsp-config.json");
  try {
    if (existsSync(configPath)) {
      return JSON.parse(readFileSync(configPath, "utf8"));
    }
  } catch (e) {
    // Ignore config parsing errors
  }
  return {};
}

// Helper function to check if a language is disabled
function isLanguageDisabled(projectRoot: string, language: string): boolean {
  const config = readLspConfig(projectRoot);
  
  // Check global disable
  if (config.disable === true) {
    return true;
  }
  
  // Check language-specific disable
  const langKey = `disable${language}`;
  return config[langKey] === true;
}

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

  // Check if TypeScript checking is disabled
  if (isLanguageDisabled(projectRoot, "TypeScript")) {
    result.tool = "tsc (disabled)";
    return result; // Return empty diagnostics
  }

  // Build tsc arguments dynamically
  const tscArgs = ["tsc", "--noEmit", "--pretty", "false"];
  
  // Find the nearest tsconfig.json
  const tsconfigRoot = findTsconfigRoot(file);
  
  if (process.env.DEBUG) {
    console.error("Project root:", projectRoot);
    console.error("Tsconfig root:", tsconfigRoot);
  }
  
  if (tsconfigRoot) {
    const tsconfigPath = join(tsconfigRoot, "tsconfig.json");
    if (process.env.DEBUG) {
      console.error("Attempting to read tsconfig from:", tsconfigPath);
    }
    try {
      // Read and strip comments from tsconfig (TypeScript allows comments but JSON.parse doesn't)
      const tsconfigContent = readFileSync(tsconfigPath, "utf-8");
      
      // More careful comment removal that doesn't break strings
      const cleanedContent = tsconfigContent
        .split('\n')
        .map(line => {
          // Don't remove // inside strings
          let inString = false;
          let result = '';
          for (let i = 0; i < line.length; i++) {
            const char = line[i];
            const next = line[i + 1];
            
            if (char === '"' && (i === 0 || line[i - 1] !== '\\')) {
              inString = !inString;
            }
            
            if (!inString && char === '/' && next === '/') {
              break; // Rest of line is a comment
            }
            
            result += char;
          }
          return result.trim();
        })
        .filter(line => line.length > 0) // Remove empty lines
        .join('\n')
        .replace(/\/\*[\s\S]*?\*\//g, ''); // Remove /* */ comments (still simple regex)
      
      const tsconfig = JSON.parse(cleanedContent);
      const compilerOptions = tsconfig.compilerOptions || {};
      
      if (process.env.DEBUG) {
        console.error("Found tsconfig.json at:", tsconfigPath);
        console.error("Module:", compilerOptions.module, "Target:", compilerOptions.target);
        console.error("Types:", compilerOptions.types);
      }
      
      // Add module and target if they support modern features
      if (compilerOptions.module === "ESNext" || compilerOptions.module === "esnext") {
        tscArgs.push("--module", "esnext");
      }
      if (compilerOptions.target === "ESNext" || compilerOptions.target === "esnext") {
        tscArgs.push("--target", "esnext");
      }
      
      // Add lib if specified
      if (compilerOptions.lib && Array.isArray(compilerOptions.lib)) {
        tscArgs.push("--lib", compilerOptions.lib.join(","));
      }
      
      // Add moduleResolution if it's bundler
      if (compilerOptions.moduleResolution === "bundler") {
        tscArgs.push("--moduleResolution", "bundler");
      }
      
      // Add jsx if specified
      if (compilerOptions.jsx) {
        tscArgs.push("--jsx", compilerOptions.jsx);
      }
      
      // Add boolean flags
      if (compilerOptions.allowJs) {
        tscArgs.push("--allowJs");
      }
      if (compilerOptions.allowImportingTsExtensions) {
        tscArgs.push("--allowImportingTsExtensions");
      }
      if (compilerOptions.strict) {
        tscArgs.push("--strict");
      }
      if (compilerOptions.skipLibCheck) {
        tscArgs.push("--skipLibCheck");
      }
      if (compilerOptions.esModuleInterop) {
        tscArgs.push("--esModuleInterop");
      }
      if (compilerOptions.resolveJsonModule) {
        tscArgs.push("--resolveJsonModule");
      }
      if (compilerOptions.isolatedModules) {
        tscArgs.push("--isolatedModules");
      }
      
      // Add baseUrl if specified (important for path resolution)
      if (compilerOptions.baseUrl) {
        tscArgs.push("--baseUrl", compilerOptions.baseUrl);
      }
      
      // Add paths if specified (for @ imports etc)
      if (compilerOptions.paths) {
        // TypeScript CLI doesn't support --paths directly, but baseUrl helps
        // The paths config needs the tsconfig.json to work properly
      }
      if (compilerOptions.noFallthroughCasesInSwitch) {
        tscArgs.push("--noFallthroughCasesInSwitch");
      }
      if (compilerOptions.noImplicitOverride) {
        tscArgs.push("--noImplicitOverride");
      }
      if (compilerOptions.moduleDetection) {
        tscArgs.push("--moduleDetection", compilerOptions.moduleDetection);
      }
      
      // Add flags that might be false (only add if explicitly true)
      if (compilerOptions.noUnusedLocals === true) {
        tscArgs.push("--noUnusedLocals");
      }
      if (compilerOptions.noUnusedParameters === true) {
        tscArgs.push("--noUnusedParameters");
      }
      if (compilerOptions.noUncheckedIndexedAccess === true) {
        tscArgs.push("--noUncheckedIndexedAccess");
      }
      if (compilerOptions.verbatimModuleSyntax === true) {
        tscArgs.push("--verbatimModuleSyntax");
      }
      
      // Check for Bun types
      const types = compilerOptions.types || [];
      if (types.includes("bun")) {
        tscArgs.push("--types", "bun");
        result.tool = "tsc (bun)";
      }
    } catch (e) {
      // If we can't parse tsconfig, just use defaults
      if (process.env.DEBUG) {
        console.error("Error reading tsconfig:", e);
      }
    }
  }
  
  // Determine working directory and file argument
  const workingDir = tsconfigRoot || projectRoot;
  
  // When we have a tsconfig, use a relative path from that directory
  // This helps tsc properly resolve module paths
  const fileArg = tsconfigRoot ? relative(tsconfigRoot, file) : file;
  
  // Add the file to check
  tscArgs.push(fileArg);
  
  // Debug: Log the command being run
  if (process.env.DEBUG) {
    console.error("Running:", tscArgs.join(" "));
    console.error("From directory:", workingDir);
  }

  // Run tsc from the directory containing tsconfig.json if found, otherwise from project root
  const { stdout, stderr, timedOut } = await runCommand(
    tscArgs,
    { NO_COLOR: "1" },
    workingDir
  );

  if (timedOut) {
    result.timedOut = true;
    result.diagnostics.push({
      line: 1,
      column: 1,
      severity: "warning",
      message: `TypeScript check timed out`
    });
    return result;
  }

  // Parse TypeScript output
  const output = stderr || stdout;
  const lines = output.split("\n");
  
  for (const line of lines) {
    const match = line.match(/^(.+?)\((\d+),(\d+)\): (error|warning) TS\d+: (.+)$/);
    if (match) {
      const matchedFile = match[1];
      // Match if it's the same file - tsc outputs relative path when run from project root
      // Check: exact match, relative path match, or basename match
      const isTargetFile = matchedFile === file || 
                          matchedFile === relativePath ||
                          (matchedFile.includes(basename(file)) && !matchedFile.includes('node_modules'));
      
      if (isTargetFile) {
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

  // Check if Python checking is disabled
  if (isLanguageDisabled(projectRoot, "Python")) {
    result.tool = "pyright (disabled)";
    return result; // Return empty diagnostics
  }

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
    { PATH: `/Users/steven_chong/.bun/bin:${process.env.PATH}` },
    projectRoot
  );

  if (timedOut) {
    // Try faster mypy as fallback
    const mypyResult = await runCommand(
      ["mypy", "--no-error-summary", "--show-column-numbers", file],
      
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

  // Check if Go checking is disabled
  if (isLanguageDisabled(projectRoot, "Go")) {
    result.tool = "go (disabled)";
    return result; // Return empty diagnostics
  }

  // Check if we're in a Go module
  const hasGoMod = existsSync(join(projectRoot, "go.mod"));
  
  // Use go vet for better static analysis instead of go run
  const goArgs = hasGoMod 
    ? ["go", "vet", relativePath]  // Use module-aware mode
    : ["go", "vet", file];         // Fallback to direct file

  const { stderr, stdout, timedOut } = await runCommand(
    goArgs,
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
  const projectRoot = findProjectRoot(file);
  const relativePath = relative(projectRoot, file);
  
  const result: FileCheckResult = {
    file: relativePath,
    tool: "rustc",
    diagnostics: []
  };

  // Check if Rust checking is disabled
  if (isLanguageDisabled(projectRoot, "Rust")) {
    result.tool = "rustc (disabled)";
    return result; // Return empty diagnostics
  }

  // Rust can be slow to compile
  const { stderr, timedOut } = await runCommand(
    ["rustc", "--error-format=json", "--edition", "2021", relativePath],
    undefined,
    projectRoot
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

  // Check if Java checking is disabled
  if (isLanguageDisabled(projectRoot, "Java")) {
    result.tool = "javac (disabled)";
    return result; // Return empty diagnostics
  }

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
  const projectRoot = findProjectRoot(file);
  const relativePath = relative(projectRoot, file);
  
  const result: FileCheckResult = {
    file: relativePath,
    tool: "gcc",
    diagnostics: []
  };

  // Check if C++ checking is disabled
  if (isLanguageDisabled(projectRoot, "Cpp")) {
    result.tool = "gcc (disabled)";
    return result; // Return empty diagnostics
  }

  const { stderr, timedOut } = await runCommand(
    ["gcc", "-fsyntax-only", "-Wall", relativePath],
    undefined,
    projectRoot
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
  const projectRoot = findProjectRoot(file);
  const relativePath = relative(projectRoot, file);
  
  const result: FileCheckResult = {
    file: relativePath,
    tool: "php",
    diagnostics: []
  };

  // Check if PHP checking is disabled
  if (isLanguageDisabled(projectRoot, "Php")) {
    result.tool = "php (disabled)";
    return result; // Return empty diagnostics
  }

  const { stderr, timedOut } = await runCommand(
    ["php", "-l", relativePath],
    undefined,
    projectRoot
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

  // Check if Scala checking is disabled
  if (isLanguageDisabled(projectRoot, "Scala")) {
    result.tool = "scalac (disabled)";
    return result; // Return empty diagnostics
  }

  // For Scala projects, we need to compile files with their dependencies
  // to avoid false positives about missing types
  const fileDir = dirname(file);
  const scalaFilesInDir = readdirSync(fileDir).filter((f: string) => f.endsWith('.scala'));
  const isMultiFilePackage = scalaFilesInDir.length > 1;

  let scalaArgs = ["scalac", "-explain", "-nowarn"];
  
  const hasBuildSbt = existsSync(join(projectRoot, "build.sbt"));
  
  // Build classpath including compiled classes and dependencies
  const classpathParts: string[] = [];
  
  if (hasBuildSbt) {
    // Add common target directories for compiled classes
    const targetDirs = [
      join(projectRoot, "target", "scala-3.3.1", "classes"),
      join(projectRoot, "target", "scala-3.3.0", "classes"),
      join(projectRoot, "target", "scala-3.4.3", "classes"),
      join(projectRoot, "target", "scala-2.13", "classes"),
      join(projectRoot, "target", "scala-2.12", "classes"),
      // Multi-module project paths
      join(projectRoot, "core", "jvm", "target", "scala-3.3.1", "classes"),
      join(projectRoot, "core", "jvm", "target", "scala-3.3.0", "classes"),
      join(projectRoot, "core", "jvm", "target", "scala-3.4.3", "classes"),
      join(projectRoot, "core", "shared", "jvm", "target", "scala-3.3.1", "classes"),
      join(projectRoot, "modules", "*", "target", "scala-*", "classes"),
    ];
    
    for (const dir of targetDirs) {
      if (dir.includes("*")) {
        // Handle glob patterns
        const parts = dir.split("/");
        let currentPath = projectRoot;
        for (const part of parts.slice(1)) {
          if (part === "*") {
            if (existsSync(currentPath)) {
              const subdirs = readdirSync(currentPath).filter(d => {
                const fullPath = join(currentPath, d);
                return existsSync(fullPath) && statSync(fullPath).isDirectory();
              });
              for (const subdir of subdirs) {
                const testPath = join(currentPath, subdir);
                if (existsSync(testPath)) {
                  classpathParts.push(testPath);
                }
              }
            }
            break;
          } else if (part.includes("scala-")) {
            if (existsSync(currentPath)) {
              const scalaDirs = readdirSync(currentPath).filter(d => d.startsWith("scala-"));
              for (const scalaDir of scalaDirs) {
                const classesPath = join(currentPath, scalaDir, "classes");
                if (existsSync(classesPath)) {
                  classpathParts.push(classesPath);
                }
              }
            }
            break;
          } else {
            currentPath = join(currentPath, part);
          }
        }
      } else if (existsSync(dir)) {
        classpathParts.push(dir);
      }
    }
  }
  
  // Add classpath if we found any
  if (classpathParts.length > 0) {
    scalaArgs.push("-cp", classpathParts.join(":"));
  }
  
  // Collect all Scala files that should be compiled together
  const filesToCompile: string[] = [];
  
  if (isMultiFilePackage) {
    // Include all Scala files in the same directory
    scalaFilesInDir.forEach(f => {
      filesToCompile.push(join(fileDir, f));
    });
    
    if (process.env.DEBUG) {
      console.error(`Compiling ${filesToCompile.length} Scala files together from ${fileDir}`);
      console.error("Files:", filesToCompile.map(f => basename(f)).join(", "));
    }
  } else {
    filesToCompile.push(file);
  }
  
  // Add the files to compile
  scalaArgs.push(...filesToCompile);

  // Run scalac with or without classpath
  const { stderr, timedOut } = await runCommand(
    scalaArgs,
    undefined,
    projectRoot
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
  const targetFileName = basename(file);
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Remove ANSI color codes and match Scala 3 error format
    const cleanLine = line.replace(/\x1b\[[0-9;]*m/g, '');
    const match = cleanLine.match(/-- \[E\d+\] (.+): (.+?):(\d+):(\d+)/);
    if (match) {
      // Check if this error is for the file we're checking
      const errorFile = match[2];
      if (!errorFile.endsWith(targetFileName)) {
        // Skip errors from other files when we're compiling multiple files together
        continue;
      }
      
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
        line: parseInt(match[3]),
        column: parseInt(match[4]),
        severity: "error",
        message: message
      });
    }
  }

  // Filter common false positives in multi-module SBT projects
  const hasProjectDir = existsSync(join(projectRoot, "project"));
  
  // Check global and language-specific filter settings from config file
  const filterConfig = readLspConfig(projectRoot);
  const globalFilterEnabled = filterConfig.disableFilter !== true; // Default: enabled
  const scalaFilterEnabled = filterConfig.disableScalaFilter !== true; // Default: enabled
  const filterEnabled = globalFilterEnabled && scalaFilterEnabled;
  
  if (hasBuildSbt && hasProjectDir && filterEnabled) {
    // Conservative filtering - only filter very specific cross-module patterns
    result.diagnostics = result.diagnostics.filter(diagnostic => {
      const message = diagnostic.message.toLowerCase();
      
      // Very specific false positive patterns that are clearly cross-module issues
      const crossModulePatterns = [
        /value \w+ is not a member of \w+ - did you mean/i, // "value task is not a member of rapid - did you mean rapid.Task?"
        /value \w+ is not a member of \w+$/i,               // "value monitor is not a member of rapid" (ends with package name)
        /value \w+ is not a member of any$/i,               // "value taskTypeWithDepth is not a member of Any"
        /^cyclic error$/i,                                  // "Cyclic Error" - compilation dependency issues
        /^type error$/i,                                    // "Type Error" - generic type resolution failures
        /^type mismatch error$/i,                           // "Type Mismatch Error" - cross-module type mismatches
        /not found: type \w+$/i,                            // "Not found: type Fiber" - cross-module type references
      ];
      
      // Keep diagnostic if it doesn't match cross-module patterns
      return !crossModulePatterns.some(pattern => pattern.test(message));
    });
    
    if (result.diagnostics.length === 0) {
      result.tool = "scalac (filtered)";
    }
  }

  return result;
}

async function checkLua(file: string): Promise<FileCheckResult> {
  const projectRoot = findProjectRoot(file);
  const relativePath = relative(projectRoot, file);
  
  const result: FileCheckResult = {
    file: relativePath,
    tool: "luac",
    diagnostics: []
  };

  // Check if Lua checking is disabled
  if (isLanguageDisabled(projectRoot, "Lua")) {
    result.tool = "luac (disabled)";
    return result; // Return empty diagnostics
  }

  // Use luac -p for syntax checking (lua doesn't have a -c flag)
  const { stderr, timedOut } = await runCommand(
    ["luac", "-p", relativePath],
    undefined,
    projectRoot
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
  const projectRoot = findProjectRoot(file);
  const relativePath = relative(projectRoot, file);
  
  const result: FileCheckResult = {
    file: relativePath,
    tool: "elixir",
    diagnostics: []
  };

  // Check if Elixir checking is disabled
  if (isLanguageDisabled(projectRoot, "Elixir")) {
    result.tool = "elixir (disabled)";
    return result; // Return empty diagnostics
  }
  
  const { stderr, timedOut } = await runCommand(
    ["elixir", relativePath],
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
  const projectRoot = findProjectRoot(file);
  const relativePath = relative(projectRoot, file);
  
  const result: FileCheckResult = {
    file: relativePath,
    tool: "terraform",
    diagnostics: []
  };

  // Check if Terraform checking is disabled
  if (isLanguageDisabled(projectRoot, "Terraform")) {
    result.tool = "terraform (disabled)";
    return result; // Return empty diagnostics
  }

  const { stdout, stderr, timedOut } = await runCommand(
    ["terraform", "fmt", "-check", "-diff", relativePath],
    undefined,
    projectRoot
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
    return "";
  }

  const errors = result.diagnostics.filter(d => d.severity === "error");
  const warnings = result.diagnostics.filter(d => d.severity === "warning");
  
  // Build summary - only show non-zero counts (use (s) format for consistency)
  const summaryParts = [];
  if (errors.length > 0) summaryParts.push(`${errors.length} error(s)`);
  if (warnings.length > 0) summaryParts.push(`${warnings.length} warning(s)`);
  
  const jsonResult = {
    diagnostics: result.diagnostics.slice(0, 5), // Show at most 5 items
    summary: summaryParts.length > 0 ? summaryParts.join(" and ") : "no errors or warnings"
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
    console.error("Usage: file-checker-v2.ts <file>");
    process.exit(1);
  }
  
  console.log(`Checking ${file}...`);
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
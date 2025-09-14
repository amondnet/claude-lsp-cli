#!/usr/bin/env bun
/**
 * File-Based Type Checker V2 - With timeout handling
 *
 * Handles slow commands gracefully with configurable timeouts
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { dirname, basename, extname, join, relative } from 'path';
import { tmpdir } from 'os';
import { getLanguageForExtension } from './language-extensions';
import {
  runCommand,
  readLspConfig,
  isLanguageDisabled,
  findProjectRoot,
  findTsconfigRoot,
} from './utils/common';

// Project root detection and findTsconfigRoot are now imported from utils/common

// No timeout - let tools complete naturally

export interface FileCheckResult {
  file: string;
  tool: string;
  diagnostics: Array<{
    line: number;
    column: number;
    severity: 'error' | 'warning' | 'info';
    message: string;
  }>;
  timedOut?: boolean;
}

// runCommand is now imported from utils/common

/**
 * Check a single file with timeout protection
 */
// readLspConfig and isLanguageDisabled are now imported from utils/common

export async function checkFile(filePath: string): Promise<FileCheckResult | null> {
  if (!existsSync(filePath)) {
    return null;
  }

  const projectRoot = findProjectRoot(filePath);

  // Try registry-based checker first
  try {
    const { checkFileWithRegistry } = await import('./generic-checker');
    const result = await checkFileWithRegistry(filePath, projectRoot);
    if (result !== null) {
      return result;
    }
  } catch (error) {
    if (process.env.DEBUG) {
      console.error('Registry checker failed, falling back to legacy:', error);
    }
  }

  // Fallback to legacy implementation
  const ext = extname(filePath).toLowerCase();
  const language = getLanguageForExtension(ext);

  if (!language) {
    return null;
  }

  // Map language to checker function
  switch (language) {
    case 'typescript':
      return await checkTypeScript(filePath);
    case 'python':
      return await checkPython(filePath);
    case 'go':
      return await checkGo(filePath);
    case 'rust':
      return await checkRust(filePath);
    case 'java':
      return await checkJava(filePath);
    case 'cpp':
      return await checkCpp(filePath);
    case 'php':
      return await checkPhp(filePath);
    case 'scala':
      return await checkScala(filePath);
    case 'lua':
      return await checkLua(filePath);
    case 'elixir':
      return await checkElixir(filePath);
    case 'terraform':
      return await checkTerraform(filePath);
    default:
      return null;
  }
}

// Language-specific checkers with timeout

// TypeScript helper functions - extracted from checkTypeScript for maintainability

/**
 * Find local TypeScript compiler installation
 */
function findTscCommand(projectRoot: string): string {
  // Check in the project being analyzed (highest priority)
  const projectLocalTsc = join(projectRoot, 'node_modules', '.bin', 'tsc');
  if (existsSync(projectLocalTsc)) {
    return projectLocalTsc;
  }

  // Check relative to current working directory (where the binary is run from)
  const cwdLocalTsc = join(process.cwd(), 'node_modules', '.bin', 'tsc');
  if (existsSync(cwdLocalTsc)) {
    return cwdLocalTsc;
  }

  // Return 'tsc' to attempt using global installation
  // The actual availability check will happen when we try to run it
  return 'tsc';
}

/**
 * Create temporary tsconfig for single-file checking
 */
async function createTempTsconfig(file: string, tsconfigPath: string): Promise<string | null> {
  try {
    const tempConfig = {
      extends: tsconfigPath,
      include: [file], // Use absolute path
      compilerOptions: {
        noEmit: true,
        incremental: false, // Don't create .tsbuildinfo for temp configs
      },
    };

    // Create temp tsconfig in system temp directory with unique name
    const tempTsconfigPath = join(
      tmpdir(),
      `tsconfig-check-${Date.now()}-${Math.random().toString(36).substring(7)}.json`
    );
    await Bun.write(tempTsconfigPath, JSON.stringify(tempConfig, null, 2));

    if (process.env.DEBUG) {
      console.error('Created temp tsconfig:', tempTsconfigPath);
      console.error('Temp config:', JSON.stringify(tempConfig, null, 2));
    }

    return tempTsconfigPath;
  } catch (e) {
    if (process.env.DEBUG) {
      console.error('Failed to create temp tsconfig:', e);
    }
    return null;
  }
}

/**
 * Strip comments from tsconfig.json content
 */
function stripTsconfigComments(content: string): string {
  return content
    .split('\n')
    .map((line) => {
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
    .filter((line) => line.length > 0) // Remove empty lines
    .join('\n')
    .replace(/\/\*[\s\S]*?\*\//g, ''); // Remove /* */ comments
}

/**
 * Build TypeScript compiler arguments from tsconfig
 */
function buildTscArgsFromConfig(
  compilerOptions: Record<string, unknown>,
  tscArgs: string[]
): string {
  let toolDescription = 'tsc';

  // Add module and target if they support modern features
  if (compilerOptions.module === 'ESNext' || compilerOptions.module === 'esnext') {
    tscArgs.push('--module', 'esnext');
  }
  if (compilerOptions.target === 'ESNext' || compilerOptions.target === 'esnext') {
    tscArgs.push('--target', 'esnext');
  }

  // Add lib if specified
  if (compilerOptions.lib && Array.isArray(compilerOptions.lib)) {
    tscArgs.push('--lib', compilerOptions.lib.join(','));
  }

  // Add moduleResolution if it's bundler
  if (compilerOptions.moduleResolution === 'bundler') {
    tscArgs.push('--moduleResolution', 'bundler');
  }

  // Add jsx if specified
  if (compilerOptions.jsx) {
    tscArgs.push('--jsx', compilerOptions.jsx as string);
  }

  // Add boolean flags
  if (compilerOptions.allowJs) tscArgs.push('--allowJs');
  if (compilerOptions.allowImportingTsExtensions) tscArgs.push('--allowImportingTsExtensions');
  if (compilerOptions.strict) tscArgs.push('--strict');
  if (compilerOptions.skipLibCheck) tscArgs.push('--skipLibCheck');
  if (compilerOptions.esModuleInterop) tscArgs.push('--esModuleInterop');
  if (compilerOptions.resolveJsonModule) tscArgs.push('--resolveJsonModule');
  if (compilerOptions.isolatedModules) tscArgs.push('--isolatedModules');

  // Add baseUrl if specified (important for path resolution)
  if (compilerOptions.baseUrl) {
    tscArgs.push('--baseUrl', compilerOptions.baseUrl as string);
  }

  // Add advanced flags
  if (compilerOptions.noFallthroughCasesInSwitch) tscArgs.push('--noFallthroughCasesInSwitch');
  if (compilerOptions.noImplicitOverride) tscArgs.push('--noImplicitOverride');
  if (compilerOptions.moduleDetection)
    tscArgs.push('--moduleDetection', compilerOptions.moduleDetection as string);

  // Add flags that might be false (only add if explicitly true)
  if (compilerOptions.noUnusedLocals === true) tscArgs.push('--noUnusedLocals');
  if (compilerOptions.noUnusedParameters === true) tscArgs.push('--noUnusedParameters');
  if (compilerOptions.noUncheckedIndexedAccess === true) tscArgs.push('--noUncheckedIndexedAccess');
  if (compilerOptions.verbatimModuleSyntax === true) tscArgs.push('--verbatimModuleSyntax');

  // Check for Bun types
  const types = (compilerOptions.types as string[]) || [];
  if (types.includes('bun')) {
    tscArgs.push('--types', 'bun');
    toolDescription = 'tsc (bun)';
  }

  return toolDescription;
}

/**
 * Parse TypeScript diagnostic output
 */
function parseTypeScriptOutput(
  output: string,
  file: string,
  relativePath: string,
  projectRoot: string
): Array<{
  line: number;
  column: number;
  severity: 'error' | 'warning' | 'info';
  message: string;
}> {
  const diagnostics: Array<{
    line: number;
    column: number;
    severity: 'error' | 'warning' | 'info';
    message: string;
  }> = [];

  const lines = output.split('\n');

  for (const line of lines) {
    const match = line.match(/^(.+?)\((\d+),(\d+)\): (error|warning) TS\d+: (.+)$/);
    if (match) {
      const matchedFile = match[1];
      // Match if it's the same file - tsc outputs relative path when run from project root
      // Check: exact match, relative path match, or basename match
      const isTargetFile =
        matchedFile === file ||
        matchedFile === relativePath ||
        (matchedFile.includes(basename(file)) && !matchedFile.includes('node_modules'));

      if (isTargetFile) {
        let message = match[5];
        // Clean up absolute paths in error messages
        message = message.replace(
          new RegExp(projectRoot.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'),
          ''
        );
        message = message.replace(/^\/+/, ''); // Remove leading slashes

        diagnostics.push({
          line: parseInt(match[2]),
          column: parseInt(match[3]),
          severity: match[4] as 'error' | 'warning',
          message: message,
        });
      }
    }
  }

  return diagnostics;
}

/**
 * Cleanup temporary tsconfig file
 */
async function cleanupTempTsconfig(tempTsconfigPath: string): Promise<void> {
  try {
    await Bun.spawn(['rm', '-f', tempTsconfigPath]).exited;
    if (process.env.DEBUG) {
      console.error('Cleaned up temp tsconfig:', tempTsconfigPath);
    }
  } catch (e) {
    // Ignore cleanup errors
    if (process.env.DEBUG) {
      console.error('Failed to cleanup temp tsconfig:', e);
    }
  }
}

async function checkTypeScript(file: string): Promise<FileCheckResult | null> {
  const projectRoot = findProjectRoot(file);

  // Check if TypeScript checking is disabled FIRST before doing any work
  if (isLanguageDisabled(projectRoot, 'TypeScript')) {
    return null; // No checking performed - return null
  }

  const relativePath = relative(projectRoot, file);

  const result: FileCheckResult = {
    file: relativePath,
    tool: 'tsc',
    diagnostics: [],
  };

  // Find local or global tsc command
  const tscCommand = findTscCommand(projectRoot);
  const tscArgs = [tscCommand, '--noEmit', '--pretty', 'false'];

  // Find the nearest tsconfig.json
  const tsconfigRoot = findTsconfigRoot(file);

  if (process.env.DEBUG) {
    console.error('Project root:', projectRoot);
    console.error('Tsconfig root:', tsconfigRoot);
  }

  let tempTsconfigPath: string | null = null;

  // Try to create temporary tsconfig for better path mapping support
  if (tsconfigRoot) {
    const tsconfigPath = join(tsconfigRoot, 'tsconfig.json');
    tempTsconfigPath = await createTempTsconfig(file, tsconfigPath);

    if (tempTsconfigPath) {
      tscArgs.push('--project', tempTsconfigPath);
      result.tool = 'tsc (with path mappings)';
    }
  }

  // If temp tsconfig creation failed, manually parse and apply config
  if (tsconfigRoot && !tempTsconfigPath) {
    const tsconfigPath = join(tsconfigRoot, 'tsconfig.json');
    if (process.env.DEBUG) {
      console.error('Attempting to read tsconfig from:', tsconfigPath);
    }

    try {
      const tsconfigContent = readFileSync(tsconfigPath, 'utf-8');
      const cleanedContent = stripTsconfigComments(tsconfigContent);
      const tsconfig = JSON.parse(cleanedContent);
      const compilerOptions = tsconfig.compilerOptions || {};

      if (process.env.DEBUG) {
        console.error('Found tsconfig.json at:', tsconfigPath);
        console.error('Module:', compilerOptions.module, 'Target:', compilerOptions.target);
        console.error('Types:', compilerOptions.types);
      }

      result.tool = buildTscArgsFromConfig(compilerOptions, tscArgs);
    } catch (e) {
      // If we can't parse tsconfig, just use defaults
      if (process.env.DEBUG) {
        console.error('Error reading tsconfig:', e);
      }
    }
  }

  // Determine working directory and file argument
  const workingDir = tsconfigRoot || projectRoot;

  // Only add file argument if we're not using --project with temp tsconfig
  if (!tempTsconfigPath) {
    // When we have a tsconfig, use a relative path from that directory
    const fileArg = tsconfigRoot ? relative(tsconfigRoot, file) : file;
    tscArgs.push(fileArg);
  }

  // Debug: Log the command being run
  if (process.env.DEBUG) {
    console.error('Running:', tscArgs.join(' '));
    console.error('From directory:', workingDir);
  }

  // Run tsc from the directory containing tsconfig.json if found, otherwise from project root
  const { stdout, stderr, timedOut } = await runCommand(tscArgs, { NO_COLOR: '1' }, workingDir);

  // Clean up temp tsconfig if we created one
  if (tempTsconfigPath) {
    await cleanupTempTsconfig(tempTsconfigPath);
  }

  if (timedOut) {
    result.timedOut = true;
    result.diagnostics.push({
      line: 1,
      column: 1,
      severity: 'warning',
      message: `TypeScript check timed out`,
    });
    return result;
  }

  // Check if tsc command was not found
  if (stderr.includes('command not found') || stderr.includes('not found')) {
    result.diagnostics.push({
      line: 1,
      column: 1,
      severity: 'error',
      message: `TypeScript compiler (tsc) not found. Please install TypeScript: npm install -g typescript`,
    });
    return result;
  }

  // Parse TypeScript output
  const output = stderr || stdout;
  result.diagnostics = parseTypeScriptOutput(output, file, relativePath, projectRoot);

  return result;
}

async function checkPython(file: string): Promise<FileCheckResult | null> {
  const projectRoot = findProjectRoot(file);

  // Check if Python checking is disabled FIRST before doing any work
  if (isLanguageDisabled(projectRoot, 'Python')) {
    return null; // No checking performed - return null
  }

  const relativePath = relative(projectRoot, file);

  const result: FileCheckResult = {
    file: relativePath,
    tool: 'pyright',
    diagnostics: [],
  };

  // Check for Python project configuration
  const hasPyrightConfig = existsSync(join(projectRoot, 'pyrightconfig.json'));
  const hasPyprojectToml = existsSync(join(projectRoot, 'pyproject.toml'));
  // const _hasSetupCfg = existsSync(join(projectRoot, 'setup.cfg'));
  const hasRequirements = existsSync(join(projectRoot, 'requirements.txt'));
  const hasPipfile = existsSync(join(projectRoot, 'Pipfile'));
  // const _hasVenv = existsSync(join(projectRoot, '.venv')) || existsSync(join(projectRoot, 'venv'));
  // const _hasPoetryLock = existsSync(join(projectRoot, 'poetry.lock'));

  // Build pyright arguments based on project configuration
  // Try local installation first - check multiple possible locations
  let pyrightCommand = 'pyright';

  // Check in the project being analyzed
  const projectLocalPyright = join(projectRoot, 'node_modules', '.bin', 'pyright');

  // Check relative to current working directory (where the binary is run from)
  const cwdLocalPyright = join(process.cwd(), 'node_modules', '.bin', 'pyright');

  if (existsSync(projectLocalPyright)) {
    pyrightCommand = projectLocalPyright;
  } else if (existsSync(cwdLocalPyright)) {
    pyrightCommand = cwdLocalPyright;
  }

  const pyrightArgs = [pyrightCommand, '--outputjson'];

  if (hasPyrightConfig || hasPyprojectToml) {
    // Use project configuration
    pyrightArgs.push('--project', projectRoot);
  }

  pyrightArgs.push(relativePath);

  // Set up environment with PYTHONPATH to help resolve local imports
  const pythonPath = [
    projectRoot,
    join(projectRoot, 'src'),
    join(projectRoot, 'lib'),
    dirname(file), // Include the file's directory
    process.env.PYTHONPATH || '',
  ]
    .filter((p) => p)
    .join(':');

  // Try pyright with longer timeout (it can be slow on first run)
  const { stdout, stderr, timedOut } = await runCommand(
    pyrightArgs,
    {
      PATH: `${process.env.HOME}/.bun/bin:${process.env.PATH}`,
      PYTHONPATH: pythonPath,
    },
    projectRoot
  );

  if (timedOut) {
    result.timedOut = true;
    result.diagnostics.push({
      line: 1,
      column: 1,
      severity: 'warning',
      message:
        'Python check with pyright timed out. Consider checking your Python environment or file complexity.',
    });
    return result;
  }

  // Check for command not found or other execution errors
  if (
    stderr &&
    (stderr.includes('command not found') ||
      stderr.includes('not found') ||
      stderr.includes('ENOENT'))
  ) {
    result.diagnostics.push({
      line: 1,
      column: 1,
      severity: 'error',
      message:
        'pyright is not installed or not found in PATH. Install with: npm install -g pyright',
    });
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
          severity: diag.severity === 'error' ? 'error' : 'warning',
          message: diag.message,
        });
      }
    }
  } catch {
    // Parsing failed
  }

  // Load installed packages list if available
  const installedPackages: Set<string> = new Set();

  // Try to read requirements.txt for installed packages
  if (hasRequirements) {
    try {
      const requirements = readFileSync(join(projectRoot, 'requirements.txt'), 'utf8');
      requirements.split('\n').forEach((line) => {
        const pkgMatch = line.match(/^([a-zA-Z0-9_-]+)/);
        if (pkgMatch) {
          installedPackages.add(pkgMatch[1].toLowerCase());
        }
      });
    } catch {
      // Ignore pip list errors
    }
  }

  // Try to read Pipfile for packages
  if (hasPipfile) {
    try {
      const pipfile = readFileSync(join(projectRoot, 'Pipfile'), 'utf8');
      const packageSection = pipfile.match(/\[packages\]([\s\S]*?)(?:\[|$)/);
      if (packageSection) {
        packageSection[1].split('\n').forEach((line) => {
          const pkgMatch = line.match(/^([a-zA-Z0-9_-]+)\s*=/);
          if (pkgMatch) {
            installedPackages.add(pkgMatch[1].toLowerCase());
          }
        });
      }
    } catch {
      // Ignore pip list errors
    }
  }

  // Filter out common false positives from single-file checking
  const filterConfig = readLspConfig();
  const globalFilterEnabled = filterConfig.disableFilter !== true;
  const pythonFilterEnabled = filterConfig.disablePythonFilter !== true;
  const filterEnabled = globalFilterEnabled && pythonFilterEnabled;

  if (filterEnabled) {
    result.diagnostics = result.diagnostics.filter((diagnostic) => {
      const message = diagnostic.message.toLowerCase();

      // Common import-related false positives when checking single files
      const importPatterns = [
        /^import ".+" could not be resolved$/i, // Local imports
        /^cannot import name/i, // Named imports from local modules
        /^module ".+" has no attribute/i, // Module attributes not found
        /^no module named/i, // Local modules not found
        /^unbound name/i, // Names from imports
        /^".+" is not defined$/i, // Imported names not defined
        /could not be resolved from source$/i, // General import resolution
        /import could not be resolved$/i, // Import resolution failures
      ];

      // Additional patterns for common false positives in single-file checking
      // These occur when pyright can't see the full project context
      const attributePatterns = [
        /^cannot access member/i, // Member access without full type info
        /^member ".+" is unknown/i, // Unknown members in incomplete context
      ];

      // Filter out import-related false positives for local project imports
      if (importPatterns.some((pattern) => pattern.test(message))) {
        // Extract the package name from the error message
        const packageMatch = message.match(/["']([^"']+)["']/);
        if (packageMatch) {
          const packageName = packageMatch[1].split('.')[0].toLowerCase();

          // If we have a requirements file and this package is listed, keep the error
          if (installedPackages.size > 0 && installedPackages.has(packageName)) {
            return true; // This is a real error - package should be installed
          }
        }

        // Check if it's likely a local import (not a third-party package)
        const commonPackages = [
          'numpy',
          'pandas',
          'requests',
          'django',
          'flask',
          'pytest',
          'tensorflow',
          'torch',
          'sklearn',
          'matplotlib',
          'scipy',
          'pillow',
          'beautifulsoup4',
          'selenium',
          'sqlalchemy',
        ];

        // If it's a known package, keep the error
        if (commonPackages.some((pkg) => message.includes(pkg))) {
          return true;
        }

        // Otherwise, it's likely a local import - filter it out
        return false;
      }

      // Filter out attribute access false positives
      if (attributePatterns.some((pattern) => pattern.test(message))) {
        // These are typically false positives from incomplete type information
        // when analyzing single files without full project context
        return false;
      }

      return true;
    });

    if (result.diagnostics.length === 0) {
      result.tool = 'pyright (filtered)';
    }
  }

  return result;
}

async function checkGo(file: string): Promise<FileCheckResult | null> {
  const projectRoot = findProjectRoot(file);

  // Check if Go checking is disabled FIRST before doing any work
  if (isLanguageDisabled(projectRoot, 'Go')) {
    return null; // No checking performed - return null
  }

  const relativePath = relative(projectRoot, file);

  const result: FileCheckResult = {
    file: relativePath,
    tool: 'go',
    diagnostics: [],
  };

  // Check if we're in a Go module
  const hasGoMod = existsSync(join(projectRoot, 'go.mod'));

  // Use go vet for better static analysis instead of go run
  const goArgs = hasGoMod
    ? ['go', 'vet', relativePath] // Use module-aware mode
    : ['go', 'vet', file]; // Fallback to direct file

  const { stderr, timedOut } = await runCommand(goArgs, {}, hasGoMod ? projectRoot : undefined);

  if (timedOut) {
    result.timedOut = true;
    return result;
  }

  // Parse go vet output
  const lines = stderr.split('\n');
  for (const line of lines) {
    const match = line.match(/^.+?:(\d+):(\d+): (.+)$/);
    if (match) {
      result.diagnostics.push({
        line: parseInt(match[1]),
        column: parseInt(match[2]),
        severity: 'error',
        message: match[3],
      });
    }
  }

  return result;
}

async function checkRust(file: string): Promise<FileCheckResult | null> {
  const projectRoot = findProjectRoot(file);

  // Check if Rust checking is disabled FIRST before doing any work
  if (isLanguageDisabled(projectRoot, 'Rust')) {
    return null; // No checking performed - return null
  }

  const relativePath = relative(projectRoot, file);

  const result: FileCheckResult = {
    file: relativePath,
    tool: 'cargo',
    diagnostics: [],
  };

  // Check if this is a Cargo project
  const hasCargoToml = existsSync(join(projectRoot, 'Cargo.toml'));

  let stderr: string;
  let timedOut: boolean;

  if (hasCargoToml) {
    // Use cargo check for better dependency resolution
    const cargoResult = await runCommand(
      ['cargo', 'check', '--message-format=json'],
      undefined,
      projectRoot
    );

    // Cargo outputs JSON to stdout, not stderr!
    stderr = cargoResult.stdout || cargoResult.stderr;
    timedOut = cargoResult.timedOut;
    result.tool = 'cargo check';
  } else {
    // Fall back to rustc for single files
    const rustcResult = await runCommand(
      ['rustc', '--error-format=json', '--edition', '2021', relativePath],
      undefined,
      projectRoot
    );

    stderr = rustcResult.stderr;
    timedOut = rustcResult.timedOut;
    result.tool = 'rustc';
  }

  if (timedOut) {
    result.timedOut = true;
    result.diagnostics.push({
      line: 1,
      column: 1,
      severity: 'warning',
      message: 'Rust check timed out',
    });
    return result;
  }

  // Parse JSON output (both cargo and rustc use similar JSON format)
  const lines = stderr.split('\n');
  const targetFileName = basename(file);

  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const msg = JSON.parse(line);

      // Handle cargo's JSON format (nested message structure)
      if (msg.reason === 'compiler-message' && msg.message) {
        const message = msg.message;
        if (message.spans?.[0]) {
          const span = message.spans[0];

          // Check if this error is for our file
          if (span.file_name && span.file_name.endsWith(targetFileName)) {
            result.diagnostics.push({
              line: span.line_start || 1,
              column: span.column_start || 1,
              severity: message.level === 'error' ? 'error' : 'warning',
              message: message.message,
            });
          }
        }
      }

      // Handle rustc's diagnostic format (separate check, not else-if)
      if (msg['$message_type'] === 'diagnostic' && msg.message && msg.spans?.[0]) {
        const span = msg.spans[0];

        // Check if this error is for our file
        if (span.file_name && span.file_name.endsWith(targetFileName)) {
          result.diagnostics.push({
            line: span.line_start || 1,
            column: span.column_start || 1,
            severity: msg.level === 'error' ? 'error' : 'warning',
            message: msg.message,
          });
        }
      }
    } catch {
      // Not JSON
    }
  }

  return result;
}

async function checkJava(file: string): Promise<FileCheckResult | null> {
  const projectRoot = findProjectRoot(file);

  // Check if Java checking is disabled FIRST before doing any work
  if (isLanguageDisabled(projectRoot, 'Java')) {
    return null; // No checking performed - return null
  }

  const relativePath = relative(projectRoot, file);

  const result: FileCheckResult = {
    file: relativePath,
    tool: 'javac',
    diagnostics: [],
  };

  // Check for Java project files
  const hasPom = existsSync(join(projectRoot, 'pom.xml'));
  const hasGradle =
    existsSync(join(projectRoot, 'build.gradle')) ||
    existsSync(join(projectRoot, 'build.gradle.kts'));

  const targetFileName = basename(file);

  // Try to use build tools first for better accuracy
  if (hasPom) {
    // Try Maven compile for full project context
    try {
      const mvnResult = await runCommand(['mvn', 'compile', '-q'], undefined, projectRoot);

      if (!mvnResult.timedOut) {
        // Check if Maven command was found
        if (mvnResult.stderr.includes('command not found')) {
          result.diagnostics.push({
            line: 1,
            column: 1,
            severity: 'error',
            message:
              'Maven project detected but Maven is not installed. Please install Maven to check Java files in this project.',
          });
          result.tool = 'maven';
          return result;
        }

        // Parse Maven output for errors
        const lines = mvnResult.stdout.split('\n').concat(mvnResult.stderr.split('\n'));

        for (const line of lines) {
          // Maven error format: [ERROR] /path/to/File.java:[10,5] error message
          const match = line.match(/\[ERROR\]\s+(.+?):\[(\d+),(\d+)\]\s+(.+)/);
          if (match && match[1].endsWith(targetFileName)) {
            result.diagnostics.push({
              line: parseInt(match[2]),
              column: parseInt(match[3]),
              severity: 'error',
              message: match[4],
            });
          }
        }

        result.tool = 'maven';
        // Always return for Maven projects - no fallback
        return result;
      } else {
        // Maven timed out
        result.diagnostics.push({
          line: 1,
          column: 1,
          severity: 'warning',
          message:
            'Maven compilation timed out. The project may be too large or Maven may be misconfigured.',
        });
        result.tool = 'maven';
        result.timedOut = true;
        return result;
      }
    } catch (e) {
      // Maven not available or failed
      if (process.env.DEBUG) {
        console.error('Maven failed:', e);
      }
      // Return error for Maven projects without Maven
      result.diagnostics.push({
        line: 1,
        column: 1,
        severity: 'error',
        message:
          'Maven project detected but Maven is not available. Please install Maven to check Java files in this project.',
      });
      result.tool = 'maven';
      return result;
    }
  }

  if (hasGradle) {
    // Try Gradle compile for full project context
    try {
      const gradleResult = await runCommand(
        ['gradle', 'compileJava', '-q'],
        undefined,
        projectRoot
      );

      // Check if Gradle command was not found
      if (
        gradleResult.stderr.includes('command not found') ||
        gradleResult.stderr.includes('gradle: not found')
      ) {
        result.diagnostics.push({
          line: 1,
          column: 1,
          severity: 'error',
          message:
            'Gradle project detected but Gradle is not available. Please install Gradle to check Java files in this project.',
        });
        result.tool = 'gradle';
        return result;
      }

      // Handle timeout
      if (gradleResult.timedOut) {
        result.timedOut = true;
        result.diagnostics.push({
          line: 1,
          column: 1,
          severity: 'warning',
          message:
            'Gradle compilation timed out. The file may be too complex or the project may need additional setup.',
        });
        result.tool = 'gradle';
        return result;
      }

      // Parse Gradle output for errors
      const lines = gradleResult.stderr.split('\n');

      for (const line of lines) {
        // Gradle error format: /path/to/File.java:10: error: message
        const match = line.match(/(.+?):(\d+):\s+(error|warning):\s+(.+)/);
        if (match && match[1].endsWith(targetFileName)) {
          result.diagnostics.push({
            line: parseInt(match[2]),
            column: 1,
            severity: match[3] as 'error' | 'warning',
            message: match[4],
          });
        }
      }

      result.tool = 'gradle';
      // Always return after Gradle attempt - no fallback to javac
      return result;
    } catch (e) {
      // Gradle not available or failed
      if (process.env.DEBUG) {
        console.error('Gradle failed:', e);
      }
      // Return error for Gradle projects without Gradle
      result.diagnostics.push({
        line: 1,
        column: 1,
        severity: 'error',
        message:
          'Gradle project detected but Gradle is not available. Please install Gradle to check Java files in this project.',
      });
      result.tool = 'gradle';
      return result;
    }
  }

  // Use javac for standalone Java files (no build system)
  // First check if javac is available
  const javacCheckResult = await runCommand(['which', 'javac'], {}, projectRoot);
  if (!javacCheckResult.stdout || javacCheckResult.stdout.trim() === '') {
    // javac is not available - return clear error
    result.diagnostics.push({
      line: 1,
      column: 1,
      severity: 'error',
      message:
        'Java compiler (javac) not found. Please install JDK to check Java files. Install with: brew install openjdk (macOS) or apt-get install default-jdk (Linux)',
    });
    return result;
  }

  const javacArgs = ['javac', '-Xlint:all', '-d', tmpdir()];

  // Add classpath for common directories if in a project
  if (hasPom || hasGradle) {
    const srcDir = join(projectRoot, 'src', 'main', 'java');
    const targetDir = join(projectRoot, 'target', 'classes');
    const buildDir = join(projectRoot, 'build', 'classes', 'java', 'main');

    const classpath: string[] = [];
    if (existsSync(targetDir)) classpath.push(targetDir); // Maven
    if (existsSync(buildDir)) classpath.push(buildDir); // Gradle
    if (existsSync(srcDir)) classpath.push(srcDir);

    // Add common dependency directories
    const m2Repo = join(process.env.HOME || '', '.m2', 'repository');
    const gradleCache = join(process.env.HOME || '', '.gradle', 'caches', 'modules-2', 'files-2.1');

    if (hasPom && existsSync(m2Repo)) {
      // Could parse pom.xml here to get exact dependencies, but that's complex
      // For now, just add the repository root
      classpath.push(m2Repo + '/*');
    }

    if (hasGradle && existsSync(gradleCache)) {
      classpath.push(gradleCache + '/*');
    }

    if (classpath.length > 0) {
      javacArgs.push('-cp', classpath.join(':'));
    }
  }

  // For Java files, compile all files in the same package to avoid "cannot find symbol" errors
  const fileDir = dirname(file);
  const javaFilesInPackage = readdirSync(fileDir)
    .filter((f: string) => f.endsWith('.java'))
    .map((f: string) => join(fileDir, f));

  // Add all Java files in the package
  javacArgs.push(...javaFilesInPackage);

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
      severity: 'warning',
      message: 'Java compilation timed out. The file may be too complex or have many dependencies.',
    });
    return result;
  }

  // Double-check if javac failed due to not being found (shouldn't happen after which check, but be defensive)
  if (stderr.includes('command not found') || stderr.includes('javac: not found')) {
    result.diagnostics.push({
      line: 1,
      column: 1,
      severity: 'error',
      message: 'Java compiler (javac) not found. Please install JDK to check Java files.',
    });
    return result;
  }

  // Parse javac output - only show errors for the target file
  const lines = stderr.split('\n');

  for (const line of lines) {
    // javac format: filename.java:line: error: message
    const match = line.match(/^(.+?):(\d+): (error|warning): (.+)$/);
    if (match) {
      // Only include errors for the target file we're checking
      const errorFile = basename(match[1]);
      if (errorFile === targetFileName) {
        result.diagnostics.push({
          line: parseInt(match[2]),
          column: 1,
          severity: match[3] as 'error' | 'warning',
          message: match[4],
        });
      }
    }
  }

  return result;
}

async function checkCpp(file: string): Promise<FileCheckResult | null> {
  const projectRoot = findProjectRoot(file);

  // Check if C++ checking is disabled FIRST before doing any work
  if (isLanguageDisabled(projectRoot, 'Cpp')) {
    return null; // No checking performed - return null
  }

  const relativePath = relative(projectRoot, file);

  const result: FileCheckResult = {
    file: relativePath,
    tool: 'gcc',
    diagnostics: [],
  };

  const { stderr, timedOut } = await runCommand(
    ['gcc', '-fsyntax-only', '-Wall', relativePath],
    undefined,
    projectRoot
  );

  if (timedOut) {
    result.timedOut = true;
    result.diagnostics.push({
      line: 1,
      column: 1,
      severity: 'warning',
      message: 'C++ check timed out',
    });
    return result;
  }

  // Parse GCC output
  const lines = stderr.split('\n');
  for (const line of lines) {
    // Match both regular errors/warnings and fatal errors
    const match = line.match(/^.+?:(\d+):(\d+): (error|warning|fatal error): (.+)$/);
    if (match) {
      result.diagnostics.push({
        line: parseInt(match[1]),
        column: parseInt(match[2]),
        severity: match[3].includes('error') ? 'error' : 'warning',
        message: match[4],
      });
    }
  }

  return result;
}

async function checkPhp(file: string): Promise<FileCheckResult | null> {
  const projectRoot = findProjectRoot(file);

  // Check if PHP checking is disabled FIRST before doing any work
  if (isLanguageDisabled(projectRoot, 'Php')) {
    return null; // No checking performed - return null
  }

  const relativePath = relative(projectRoot, file);

  const result: FileCheckResult = {
    file: relativePath,
    tool: 'php',
    diagnostics: [],
  };

  // Check for Composer configuration
  const hasComposerJson = existsSync(join(projectRoot, 'composer.json'));
  const hasVendorAutoload = existsSync(join(projectRoot, 'vendor', 'autoload.php'));

  // Build PHP arguments with autoload if available
  const phpArgs = ['php'];

  if (hasComposerJson && hasVendorAutoload) {
    // Include Composer autoloader for better class resolution
    // Use -d to set include_path to include vendor autoload
    phpArgs.push('-d', `auto_prepend_file=${join(projectRoot, 'vendor', 'autoload.php')}`);
  }

  // Add lint flag and file
  phpArgs.push('-l', relativePath);

  const { stderr, stdout, timedOut } = await runCommand(phpArgs, undefined, projectRoot);

  if (timedOut) {
    result.timedOut = true;
    return result;
  }

  // Parse PHP lint output (can be in stderr or stdout)
  const output = stderr + stdout;
  const lines = output.split('\n');

  for (const line of lines) {
    // Parse error format: "Parse error: message in file on line X"
    const parseMatch = line.match(/Parse error: (.+) in .+ on line (\d+)/);
    if (parseMatch) {
      result.diagnostics.push({
        line: parseInt(parseMatch[2]),
        column: 1,
        severity: 'error',
        message: parseMatch[1],
      });
    }

    // Fatal error format: "Fatal error: message in file on line X"
    const fatalMatch = line.match(/Fatal error: (.+) in .+ on line (\d+)/);
    if (fatalMatch) {
      result.diagnostics.push({
        line: parseInt(fatalMatch[2]),
        column: 1,
        severity: 'error',
        message: fatalMatch[1],
      });
    }

    // Warning format: "Warning: message in file on line X"
    const warningMatch = line.match(/Warning: (.+) in .+ on line (\d+)/);
    if (warningMatch) {
      result.diagnostics.push({
        line: parseInt(warningMatch[2]),
        column: 1,
        severity: 'warning',
        message: warningMatch[1],
      });
    }
  }

  // If Composer is available but no basic errors found, we could try PHPStan or Psalm
  // for more advanced static analysis (future enhancement)
  if (hasComposerJson && result.diagnostics.length === 0) {
    // Check if PHPStan is available
    const hasPhpStan =
      existsSync(join(projectRoot, 'vendor', 'bin', 'phpstan')) ||
      existsSync(join(projectRoot, 'phpstan.neon'));

    if (hasPhpStan) {
      // Try PHPStan for deeper analysis
      const phpstanResult = await runCommand(
        [
          join(projectRoot, 'vendor', 'bin', 'phpstan'),
          'analyze',
          '--error-format=json',
          '--no-progress',
          file,
        ],
        undefined,
        projectRoot
      );

      if (!phpstanResult.timedOut && phpstanResult.stdout) {
        try {
          const phpstanOutput = JSON.parse(phpstanResult.stdout);
          if (phpstanOutput.files && phpstanOutput.files[file]) {
            for (const error of phpstanOutput.files[file].messages) {
              result.diagnostics.push({
                line: error.line || 1,
                column: 1,
                severity: 'error',
                message: error.message,
              });
            }
            result.tool = 'phpstan';
          }
        } catch {
          // Failed to parse PHPStan output
        }
      }
    }
  }

  return result;
}

async function checkScala(file: string): Promise<FileCheckResult | null> {
  const projectRoot = findProjectRoot(file);

  // Check if Scala checking is disabled FIRST before doing any work
  if (isLanguageDisabled(projectRoot, 'Scala')) {
    return null; // No checking performed - return null
  }

  const relativePath = relative(projectRoot, file);

  const result: FileCheckResult = {
    file: relativePath,
    tool: 'scalac',
    diagnostics: [],
  };

  // Determine project type and use the appropriate tool
  const hasBuildSbt = existsSync(join(projectRoot, 'build.sbt'));
  const hasBloopConfig = existsSync(join(projectRoot, '.bloop'));
  const useSbtCompile = readLspConfig().useScalaSbt === true;

  // Clear tool selection priority:
  // 1. SBT for SBT projects (if enabled)
  // 2. Bloop for Bloop projects
  // 3. Scalac for standalone files

  if (hasBuildSbt && useSbtCompile) {
    // Use sbt compile for full project context (slower but more accurate)

    // First check if sbt is available
    const sbtCheck = await runCommand(['which', 'sbt'], undefined, projectRoot);
    if (sbtCheck.stderr.includes('not found') || sbtCheck.stdout.trim() === '') {
      result.diagnostics.push({
        line: 1,
        column: 1,
        severity: 'error',
        message:
          'SBT is not installed. Please install sbt to check Scala projects with build.sbt. Install with: brew install sbt (macOS) or see https://www.scala-sbt.org/download.html',
      });
      return result;
    }

    try {
      const sbtResult = await runCommand(
        ['sbt', '-no-colors', '-batch', 'compile'],
        undefined,
        projectRoot
      );

      if (sbtResult.timedOut) {
        // SBT timed out - return clear error
        result.diagnostics.push({
          line: 1,
          column: 1,
          severity: 'error',
          message:
            'SBT compilation timed out. The project may be too large or there may be an issue with the build configuration.',
        });
        return result;
      }

      // Parse sbt output for errors
      const lines = sbtResult.stdout.split('\n').concat(sbtResult.stderr.split('\n'));
      const targetFileName = basename(file);

      for (const line of lines) {
        // SBT error format: [error] /path/to/file.scala:10:5: error message
        const match = line.match(/\[error\]\s+(.+?):(\d+):(\d+):\s+(.+)/);
        if (match && match[1].endsWith(targetFileName)) {
          result.diagnostics.push({
            line: parseInt(match[2]),
            column: parseInt(match[3]),
            severity: 'error',
            message: match[4],
          });
        }
      }
      result.tool = 'sbt';

      // Always return for SBT projects - no fallback to scalac
      return result;
    } catch (e) {
      // sbt failed to run - return error, no fallback
      result.diagnostics.push({
        line: 1,
        column: 1,
        severity: 'error',
        message: `SBT failed to run: ${e instanceof Error ? e.message : String(e)}. Please check your SBT installation and project configuration.`,
      });
      return result;
    }
  }

  // Use Bloop for projects with Bloop configuration
  if (hasBloopConfig) {
    // First check if bloop is available
    const bloopCheck = await runCommand(['which', 'bloop'], undefined, projectRoot);
    if (bloopCheck.stderr.includes('not found') || bloopCheck.stdout.trim() === '') {
      result.diagnostics.push({
        line: 1,
        column: 1,
        severity: 'error',
        message:
          'Bloop is not installed. Please install bloop to check Scala projects with .bloop configuration. Install with: brew install scalacenter/bloop/bloop (macOS) or see https://scalacenter.github.io/bloop/setup',
      });
      return result;
    }

    // Try to use bloop compile which understands the full project context
    try {
      const bloopResult = await runCommand(
        ['bloop', 'compile', '--no-color', relativePath],
        undefined,
        projectRoot
      );

      if (bloopResult.timedOut) {
        // Bloop timed out - return clear error
        result.diagnostics.push({
          line: 1,
          column: 1,
          severity: 'error',
          message:
            'Bloop compilation timed out. The project may be too large or there may be an issue with the Bloop configuration.',
        });
        return result;
      }

      // Parse bloop output
      const lines = bloopResult.stderr.split('\n');
      for (const line of lines) {
        const match = line.match(/\[E\d+\]\s+(.+?):(\d+):(\d+):\s+(.+)/);
        if (match && match[1].includes(basename(file))) {
          result.diagnostics.push({
            line: parseInt(match[2]),
            column: parseInt(match[3]),
            severity: 'error',
            message: match[4],
          });
        }
      }
      result.tool = 'bloop';

      // Always return for Bloop projects - no fallback to scalac
      return result;
    } catch (e) {
      // Bloop failed to run - return error, no fallback
      result.diagnostics.push({
        line: 1,
        column: 1,
        severity: 'error',
        message: `Bloop failed to run: ${e instanceof Error ? e.message : String(e)}. Please check your Bloop installation and project configuration.`,
      });
      return result;
    }
  }
  // Use scalac for standalone files (no build tool configuration)
  // This is the base case for simple Scala files
  return await checkScalaWithScalac(file, projectRoot, relativePath, result);
}

async function checkScalaWithScalac(
  file: string,
  projectRoot: string,
  relativePath: string,
  result: FileCheckResult
): Promise<FileCheckResult> {
  // For Scala projects, we need to compile files with their dependencies
  // to avoid false positives about missing types
  const fileDir = dirname(file);
  const scalaFilesInDir = readdirSync(fileDir).filter((f: string) => f.endsWith('.scala'));
  const isMultiFilePackage = scalaFilesInDir.length > 1;

  const scalaArgs = ['scalac', '-explain', '-nowarn'];

  // Check if this is an SBT project for classpath building
  const hasBuildSbt = existsSync(join(projectRoot, 'build.sbt'));

  // Build classpath including compiled classes and dependencies
  const classpathParts: string[] = [];

  if (hasBuildSbt) {
    // Add common target directories for compiled classes
    const targetDirs = [
      join(projectRoot, 'target', 'scala-3.3.1', 'classes'),
      join(projectRoot, 'target', 'scala-3.3.0', 'classes'),
      join(projectRoot, 'target', 'scala-3.4.3', 'classes'),
      join(projectRoot, 'target', 'scala-2.13', 'classes'),
      join(projectRoot, 'target', 'scala-2.12', 'classes'),
      // Multi-module project paths
      join(projectRoot, 'core', 'jvm', 'target', 'scala-3.3.1', 'classes'),
      join(projectRoot, 'core', 'jvm', 'target', 'scala-3.3.0', 'classes'),
      join(projectRoot, 'core', 'jvm', 'target', 'scala-3.4.3', 'classes'),
      join(projectRoot, 'core', 'shared', 'jvm', 'target', 'scala-3.3.1', 'classes'),
      join(projectRoot, 'modules', '*', 'target', 'scala-*', 'classes'),
    ];

    for (const dir of targetDirs) {
      if (dir.includes('*')) {
        // Handle glob patterns
        const parts = dir.split('/');
        let currentPath = projectRoot;
        for (const part of parts.slice(1)) {
          if (part === '*') {
            if (existsSync(currentPath)) {
              const subdirs = readdirSync(currentPath).filter((d) => {
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
          } else if (part.includes('scala-')) {
            if (existsSync(currentPath)) {
              const scalaDirs = readdirSync(currentPath).filter((d) => d.startsWith('scala-'));
              for (const scalaDir of scalaDirs) {
                const classesPath = join(currentPath, scalaDir, 'classes');
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
    scalaArgs.push('-cp', classpathParts.join(':'));
  }

  // Collect all Scala files that should be compiled together
  const filesToCompile: string[] = [];

  if (isMultiFilePackage) {
    // Include all Scala files in the same directory
    scalaFilesInDir.forEach((f) => {
      filesToCompile.push(join(fileDir, f));
    });

    if (process.env.DEBUG) {
      console.error(`Compiling ${filesToCompile.length} Scala files together from ${fileDir}`);
      console.error('Files:', filesToCompile.map((f) => basename(f)).join(', '));
    }
  } else {
    filesToCompile.push(file);
  }

  // Add the files to compile
  scalaArgs.push(...filesToCompile);

  // Run scalac with or without classpath
  const { stderr, timedOut } = await runCommand(scalaArgs, undefined, projectRoot);

  if (timedOut) {
    result.timedOut = true;
    result.diagnostics.push({
      line: 1,
      column: 1,
      severity: 'warning',
      message: 'Scala check timed out',
    });
    return result;
  }

  // Check if scalac is not available or failed to run
  if (
    stderr.includes('command not found') ||
    stderr.includes('scalac: not found') ||
    stderr.includes('not found: scalac') ||
    stderr.includes('No such file or directory')
  ) {
    result.diagnostics.push({
      line: 1,
      column: 1,
      severity: 'error',
      message:
        'Scala compiler (scalac) is not installed. Please install Scala to check Scala files. Install with: brew install scala (macOS) or see https://www.scala-lang.org/download/',
    });
    return result;
  }

  // If scalac ran but produced no output at all, it might be a version issue
  if (!stderr || stderr.trim() === '') {
    // No errors means compilation was successful
    return result;
  }

  // Parse Scala compiler output (format: "-- [E006] Not Found Error: file.scala:3:13")
  const lines = stderr.split('\n');
  const targetFileName = basename(file);

  // Check for Scala 2.x format (used in old CI versions)
  // Format: "Main.scala:8: error: too many arguments for method apply"
  let isScala2Format = false;
  for (const line of lines) {
    if (line.match(/^\S+\.scala:\d+: (error|warning):/)) {
      isScala2Format = true;
      break;
    }
  }

  if (isScala2Format) {
    // Parse Scala 2.x format
    for (const line of lines) {
      const ansiRegex = new RegExp(`[${String.fromCharCode(27)}]\\[[0-9;]*m`, 'g');
      const cleanLine = line.replace(ansiRegex, '');
      const scala2Match = cleanLine.match(/^(.+?):(\d+): (error|warning): (.+)$/);
      if (scala2Match) {
        const errorFile = basename(scala2Match[1]);
        if (errorFile === targetFileName) {
          result.diagnostics.push({
            line: parseInt(scala2Match[2]),
            column: 1,
            severity: scala2Match[3] as 'error' | 'warning',
            message: scala2Match[4],
          });
        }
      }
    }
    return result;
  }

  // Parse Scala 3 format
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Remove ANSI color codes and match Scala 3 error format
    const ansiRegex = new RegExp(`[${String.fromCharCode(27)}]\\[[0-9;]*m`, 'g');
    const cleanLine = line.replace(ansiRegex, '');

    // Match various Scala 3 error formats:
    // -- [E006] Not Found Error: src/main/scala/Main.scala:17:28
    // -- [E007] Type Mismatch Error: src/main/scala/Main.scala:14:28
    // -- Error: src/main/scala/Main.scala:8:34
    const match = cleanLine.match(/-- (?:\[E\d+\] )?(.+): (.+?):(\d+):(\d+)/);
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
      for (let j = i + 1; j < Math.min(i + 10, lines.length); j++) {
        const ansiRegex = new RegExp(`[${String.fromCharCode(27)}]\\[[0-9;]*m`, 'g');
        const detailLine = lines[j].replace(ansiRegex, ''); // Remove ANSI codes

        // Look for direct error messages (patterns that commonly appear in Scala errors)
        if (
          detailLine.includes('too many arguments') ||
          detailLine.includes('not a member of') ||
          detailLine.includes('Not found:') ||
          detailLine.includes('no pattern match extractor') ||
          (detailLine.includes('Found:') && detailLine.includes('Required:'))
        ) {
          message = detailLine.replace(/^\s*\|\s*/, '').trim();
          break;
        }

        // Look for pipe-formatted messages
        const detailMatch = detailLine.match(/\s*\|\s*(.+)$/);
        if (detailMatch) {
          const content = detailMatch[1].trim();
          // Skip lines with just syntax highlighting (contains only code) or arrow indicators
          if (
            content &&
            !content.match(/^\^+$/) &&
            !content.match(/^(import|class|def|val|var|if|else|for|while|try|catch)\s/)
          ) {
            // This looks like an actual error message
            if (
              content.includes('not a member of') ||
              content.includes('Not found:') ||
              content.includes('cannot be applied')
            ) {
              message = content;
              break;
            }
          }
        }
      }

      result.diagnostics.push({
        line: parseInt(match[3]),
        column: parseInt(match[4]),
        severity: 'error',
        message: message,
      });
    }
  }

  // Filter common false positives in multi-module SBT projects
  const hasProjectDir = existsSync(join(projectRoot, 'project'));

  // Check global and language-specific filter settings from config file
  const filterConfig = readLspConfig();
  const globalFilterEnabled = filterConfig.disableFilter !== true; // Default: enabled
  const scalaFilterEnabled = filterConfig.disableScalaFilter !== true; // Default: enabled
  const filterEnabled = globalFilterEnabled && scalaFilterEnabled;

  if (filterEnabled) {
    // Filter out false positives from single-file or incomplete compilation
    result.diagnostics = result.diagnostics.filter((diagnostic) => {
      const message = diagnostic.message.toLowerCase();

      // Import and dependency-related patterns that are false positives when checking single files
      const falsePositivePatterns = [
        // Import resolution issues
        /not found: (type|object|value) \w+$/i, // "Not found: type Fiber", "Not found: object rapid"
        /cannot resolve symbol/i, // Symbol resolution failures
        /package .+ does not exist/i, // Package not found
        /cannot find symbol/i, // Java interop symbol issues

        // Cross-module reference issues
        /value \w+ is not a member of \w+ - did you mean/i, // "value task is not a member of rapid - did you mean rapid.Task?"
        /value \w+ is not a member of \w+$/i, // "value monitor is not a member of rapid"
        /value \w+ is not a member of any$/i, // "value taskTypeWithDepth is not a member of Any"
        /\w+ is not a member of (package )?[\w.]+$/i, // General member access issues

        // Type resolution issues
        /^cyclic error$/i, // "Cyclic Error" - compilation dependency issues
        /^type error$/i, // "Type Error" - generic type resolution failures
        /^type mismatch error$/i, // "Type Mismatch Error" - cross-module type mismatches
        /cannot prove that/i, // Type proof failures
        /missing argument list/i, // Method call issues from incomplete context

        // Import-specific patterns
        /import .+ cannot be resolved/i, // Import resolution
        /object .+ is not a member of package/i, // Package member access
        /not found: (type|value|object)/i, // General not found errors
        /symbol not found/i, // Symbol resolution
      ];

      // Check if it's a false positive
      const isFalsePositive = falsePositivePatterns.some((pattern) => pattern.test(message));

      // Keep real syntax errors and other legitimate issues
      if (isFalsePositive) {
        // But keep if it's clearly a syntax error (not an import issue)
        const syntaxErrorIndicators = [
          /illegal start of/i,
          /unclosed/i,
          /expected but .+ found/i,
          /missing argument/i,
          /too many arguments/i,
          /unreachable code/i,
          /illegal inheritance/i,
        ];

        // If it's a syntax error, keep it despite matching false positive pattern
        return syntaxErrorIndicators.some((pattern) => pattern.test(message));
      }

      return true; // Keep all non-false-positive diagnostics
    });

    if (result.diagnostics.length === 0 && hasBuildSbt && hasProjectDir) {
      result.tool = 'scalac (filtered)';
    }
  }

  return result;
}

async function checkLua(file: string): Promise<FileCheckResult | null> {
  const projectRoot = findProjectRoot(file);

  // Check if Lua checking is disabled FIRST before doing any work
  if (isLanguageDisabled(projectRoot, 'Lua')) {
    return null; // No checking performed - return null
  }

  const relativePath = relative(projectRoot, file);

  const result: FileCheckResult = {
    file: relativePath,
    tool: 'luac',
    diagnostics: [],
  };

  // Use luac -p for syntax checking (lua doesn't have a -c flag)
  const { stderr, timedOut } = await runCommand(
    ['luac', '-p', relativePath],
    undefined,
    projectRoot
  );

  if (timedOut) {
    result.timedOut = true;
    return result;
  }

  // Parse luac output format: luac: file.lua:line: message
  const lines = stderr.split('\n');
  for (const line of lines) {
    const match = line.match(/luac: .+?:(\d+): (.+)/);
    if (match) {
      result.diagnostics.push({
        line: parseInt(match[1]),
        column: 1,
        severity: 'error',
        message: match[2],
      });
    }
  }

  return result;
}

async function checkElixir(file: string): Promise<FileCheckResult | null> {
  const projectRoot = findProjectRoot(file);

  // Check if Elixir checking is disabled FIRST before doing any work
  if (isLanguageDisabled(projectRoot, 'Elixir')) {
    return null; // No checking performed - return null
  }

  const relativePath = relative(projectRoot, file);

  const result: FileCheckResult = {
    file: relativePath,
    tool: 'elixir',
    diagnostics: [],
  };

  const { stderr, timedOut } = await runCommand(['elixir', relativePath], undefined, projectRoot);

  if (timedOut) {
    result.timedOut = true;
    result.diagnostics.push({
      line: 1,
      column: 1,
      severity: 'warning',
      message: 'Elixir check timed out',
    });
    return result;
  }

  // Parse Elixir output
  const lines = stderr.split('\n');
  for (const line of lines) {
    // Match the new error format: "error: message" followed by location
    if (line.trim().startsWith('error:')) {
      const errorMessage = line.replace(/^\s*error:\s*/, '');

      // Look for location info in subsequent lines
      for (let i = lines.indexOf(line) + 1; i < lines.length; i++) {
        const locationLine = lines[i];
        const locationMatch = locationLine.match(/└─\s+(.+?):(\d+):(\d+):/);
        if (locationMatch) {
          result.diagnostics.push({
            line: parseInt(locationMatch[2]),
            column: parseInt(locationMatch[3]),
            severity: 'error',
            message: errorMessage,
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
        severity: 'error',
        message: oldMatch[4],
      });
    }
  }

  return result;
}

async function checkTerraform(file: string): Promise<FileCheckResult | null> {
  const projectRoot = findProjectRoot(file);

  // Check if Terraform checking is disabled FIRST before doing any work
  if (isLanguageDisabled(projectRoot, 'Terraform')) {
    return null; // No checking performed - return null
  }

  const relativePath = relative(projectRoot, file);

  const result: FileCheckResult = {
    file: relativePath,
    tool: 'terraform',
    diagnostics: [],
  };

  const { stdout, stderr, timedOut } = await runCommand(
    ['terraform', 'fmt', '-check', '-diff', relativePath],
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
      severity: 'warning',
      message: 'Formatting issues detected',
    });
  }

  return result;
}

// Format diagnostics for output
export function formatDiagnostics(result: FileCheckResult): string {
  if (!result || result.diagnostics.length === 0) {
    return '';
  }

  const errors = result.diagnostics.filter((d) => d.severity === 'error');
  const warnings = result.diagnostics.filter((d) => d.severity === 'warning');

  // Build summary - only show non-zero counts (use (s) format for consistency)
  const summaryParts: string[] = [];
  if (errors.length > 0) summaryParts.push(`${errors.length} error(s)`);
  if (warnings.length > 0) summaryParts.push(`${warnings.length} warning(s)`);

  const jsonResult = {
    diagnostics: result.diagnostics.slice(0, 5), // Show at most 5 items
    summary: summaryParts.length > 0 ? summaryParts.join(' and ') : 'no errors or warnings',
  };

  if (result.timedOut) {
    jsonResult.summary += ' (partial results due to timeout)';
  }

  return `[[system-message]]:${JSON.stringify(jsonResult)}`;
}

// CLI for testing
if (import.meta.main) {
  const file = process.argv[2];

  if (!file) {
    console.error('Usage: file-checker.ts <file>');
    process.exit(1);
  }

  // Resolve relative paths to absolute
  const absolutePath = file.startsWith('/') ? file : join(process.cwd(), file);

  console.log(`Checking ${absolutePath}...`);
  const start = Date.now();

  const result = await checkFile(absolutePath);
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
    console.log(`Cannot check ${absolutePath} (unsupported type or disabled)`);
  }
}

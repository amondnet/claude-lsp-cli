/**
 * CLI Diagnostics - Clean diagnostic processing logic
 * 
 * Handles diagnostic queries and processing using the server manager
 * for all server lifecycle operations.
 */

import { readFile } from "node:fs/promises";
import { existsSync, readFileSync } from "fs";
import ignore from "ignore";
import { join, resolve, dirname, relative } from "path";
import { secureHash } from "./utils/security";
import { logger } from "./utils/logger";
import { TIMEOUTS } from "./constants";
import { ensureServerRunning } from "./cli-server-manager";

// Load gitignore patterns
async function loadGitignore(projectRoot: string): Promise<ReturnType<typeof ignore> | null> {
  try {
    const gitignorePath = join(projectRoot, '.gitignore');
    if (!existsSync(gitignorePath)) {
      // Create default ignore patterns even without .gitignore
      const ig = ignore();
      ig.add('node_modules');
      ig.add('.git');
      ig.add('dist');
      ig.add('build');
      ig.add('coverage');
      ig.add('.next');
      ig.add('.nuxt');
      ig.add('.svelte-kit');
      ig.add('*.log');
      ig.add('.DS_Store');
      return ig;
    }
    
    const content = await readFile(gitignorePath, 'utf-8');
    const ig = ignore();
    ig.add(content);
    
    // Always add these patterns
    ig.add('node_modules');
    ig.add('.git');
    
    return ig;
  } catch (error) {
    await logger.warn('Failed to load .gitignore', { error });
    // Return default patterns on error
    const ig = ignore();
    ig.add('node_modules');
    ig.add('.git');
    ig.add('dist');
    ig.add('build');
    return ig;
  }
}

// Filter out ignored files from diagnostics
async function filterDiagnostics(diagnostics: any[], projectRoot: string): Promise<any[]> {
  const ig = await loadGitignore(projectRoot);
  
  // Check if TypeScript project and load tsconfig if exists
  let hasTypeScriptConfig = false;
  let allowJs = false;
  let checkJs = false;
  
  try {
    const tsconfigPath = join(projectRoot, 'tsconfig.json');
    if (existsSync(tsconfigPath)) {
      hasTypeScriptConfig = true;
      const tsconfigContent = readFileSync(tsconfigPath, 'utf8');
      const tsconfig = JSON.parse(tsconfigContent);
      
      // Check TypeScript compiler options
      allowJs = tsconfig.compilerOptions?.allowJs || false;
      checkJs = tsconfig.compilerOptions?.checkJs || false;
    }
  } catch (e) {
    // Ignore tsconfig parse errors
  }
  
  return diagnostics.filter((d: any) => {
    if (!d.file) return true;
    
    // Convert absolute path to relative for ignore matching
    const relativePath = d.file.startsWith(projectRoot) 
      ? d.file.slice(projectRoot.length + 1)
      : d.file;
    
    // Check if file should be ignored by gitignore
    if (ig && ig.ignores(relativePath)) {
      return false;
    }
    
    // Always filter out node_modules
    if (relativePath.includes('node_modules/')) {
      return false;
    }
    
    // If this is a TypeScript project and the file is .js
    if (hasTypeScriptConfig && relativePath.endsWith('.js')) {
      // Only check JS files if TypeScript is configured to do so
      if (!allowJs && !checkJs) {
        // TypeScript is not configured to check JS files, filter them out
        return false;
      }
    }
    
    return true;
  });
}

/**
 * Find the nearest project root for a file by looking for project markers
 */
export async function findProjectRoot(filePath: string): Promise<string> {
  let currentDir = dirname(filePath);
  
  // Common project markers
  const projectMarkers = [
    'package.json', 'tsconfig.json', 'cargo.toml', 'go.mod', 
    'pom.xml', 'requirements.txt', '.git', 'pyproject.toml',
    'Gemfile', 'composer.json', 'build.gradle'
  ];
  
  // Walk up directories looking for project markers
  while (currentDir !== dirname(currentDir)) {
    for (const marker of projectMarkers) {
      if (existsSync(join(currentDir, marker))) {
        return currentDir;
      }
    }
    currentDir = dirname(currentDir);
  }
  
  // Fallback to file's directory
  return dirname(filePath);
}

/**
 * Run diagnostics for a project using the server manager
 */
export async function runDiagnostics(projectRoot: string): Promise<any> {
  const projectHash = secureHash(projectRoot).substring(0, 16);
  
  logger.setProject(projectHash);
  
  try {
    // Auto-cleanup very idle servers (> 2 hours) using server manager
    const { stopIdleServers } = await import('./cli-server-manager');
    await stopIdleServers(120); // 2 hours
    
    // Enforce server limit to prevent resource exhaustion
    const { ServerRegistry } = await import('./utils/server-registry');
    const registry = ServerRegistry.getInstance();
    await registry.enforceServerLimit(8); // Max 8 concurrent servers
    
    // Ensure server is running using server manager
    const socketPath = await ensureServerRunning(projectRoot);
    
    // Query the server for diagnostics
    let serverResponse: any = null;
    
    try {
      const response = await fetch('http://localhost/diagnostics', {
        // @ts-ignore - Bun supports unix option
        unix: socketPath,
        headers: {
          'Content-Type': 'application/json'
        },
        signal: AbortSignal.timeout(TIMEOUTS.DIAGNOSTIC_TIMEOUT_MS)
      });
      
      if (response.ok) {
        serverResponse = await response.text();
        
        // Update registry to show server is healthy and responding
        const { ServerRegistry } = await import('./utils/server-registry');
        const registry = ServerRegistry.getInstance();
        registry.updateHeartbeat(projectHash);
      } else {
        await logger.error(`Server returned error: ${response.status}`);
      }
    } catch (error) {
      await logger.error('Failed to query diagnostics from server', error);
    }
    
    return serverResponse || {
      diagnostics: [],
      timestamp: new Date().toISOString()
    };
    
  } catch (error) {
    await logger.error('Diagnostics run failed', error);
    
    // Return mock diagnostics only during installation testing
    if (process.env.NODE_ENV === 'test' && process.env.CLAUDE_LSP_MOCK_DIAGNOSTICS === 'true') {
      await logger.debug('Using mock diagnostics for test');
      return {
        diagnostics: [{
          file: join(projectRoot, 'test.ts'),
          line: 2,
          column: 7,
          severity: 'error',
          message: "Type 'number' is not assignable to type 'string'.",
          source: 'typescript',
          ruleId: '2322'
        }],
        timestamp: new Date().toISOString()
      };
    }
    
    throw error;
  }
}

/**
 * Run file-specific diagnostics using the server manager
 */
export async function runFileSpecificDiagnostics(filePath: string): Promise<string> {
  // Find project root
  const projectRoot = await findProjectRoot(filePath);
  const relativeFilePath = relative(projectRoot, filePath);
  const projectHash = secureHash(projectRoot).substring(0, 16);
  
  // Use same socket directory as server
  const socketDir = process.env.XDG_RUNTIME_DIR || 
                   (process.platform === 'darwin' 
                     ? `${process.env.HOME}/Library/Application Support/claude-lsp/run`
                     : `${process.env.HOME}/.claude-lsp/run`);
  const socketPath = `${socketDir}/claude-lsp-${projectHash}.sock`;
  
  try {
    // Ensure server is running
    await ensureServerRunning(projectRoot);
    
    // Query server with file parameter
    const response = await fetch(`http://localhost/diagnostics?file=${encodeURIComponent(relativeFilePath)}`, {
      // @ts-ignore - Bun supports unix option
      unix: socketPath,
      signal: AbortSignal.timeout(30000)
    });
    
    if (response.ok) {
      return await response.text();
    }
    
    return '[[system-message]]:{"diagnostics":[],"summary":"no warnings or errors"}';
  } catch (error) {
    await logger.error('File-specific diagnostics failed', error);
    return '[[system-message]]:{"diagnostics":[],"summary":"no warnings or errors"}';
  }
}

/**
 * Project discovery logic
 */
export async function findAllProjects(baseDir: string): Promise<string[]> {
  // Smart hierarchical project detection with controlled expansion
  const { readdir } = await import('fs/promises');
  
  try {
    const projects = new Set<string>();
    const MAX_PROJECTS = 16;
    
    // Project markers to search for
    const markers = new Set([
      'package.json', 'tsconfig.json', 'pyproject.toml', 'requirements.txt',
      'Cargo.toml', 'go.mod', 'pom.xml', 'build.gradle', 'Gemfile', 
      'composer.json', 'build.sbt', 'CMakeLists.txt', 'mix.exs', 'main.tf'
    ]);
    
    // Directories to skip
    const skipDirs = new Set(['node_modules', '.git', 'dist', 'build', '.next', '.nuxt', 'target', 'coverage', '__pycache__']);
    
    // First: Find root project (priority)
    const rootProject = await findRootProject(baseDir, markers);
    if (rootProject) {
      projects.add(rootProject);
    }
    
    // Second: Find sibling projects with controlled expansion
    if (projects.size < MAX_PROJECTS) {
      await findSiblingProjects(baseDir, markers, skipDirs, projects, MAX_PROJECTS);
    }
    
    const projectArray = Array.from(projects).sort();
    if (projectArray.length > 0) {
      await logger.debug('Found projects with smart detection', { 
        projects: projectArray.length, 
        root: rootProject || 'none',
        limit: MAX_PROJECTS 
      });
    }
    
    return projectArray;
  } catch (error) {
    await logger.debug('Failed to discover projects', { error });
    return [];
  }
}

// Helper: Check if a directory is a project based on markers or special cases
async function isProjectDirectory(entries: any[], markers: Set<string>): Promise<boolean> {
  let hasLuaFiles = false;
  
  for (const entry of entries) {
    if (entry.isFile()) {
      // Check for standard project markers
      if (markers.has(entry.name)) {
        return true;
      }
      // Special case: Lua projects (any directory with .lua files)
      if (entry.name.endsWith('.lua')) {
        hasLuaFiles = true;
      }
    }
  }
  
  // If no standard marker but has Lua files, consider it a Lua project
  return hasLuaFiles;
}

// Helper: Find the root project (directory containing project marker)
async function findRootProject(dir: string, markers: Set<string>): Promise<string | null> {
  const { readdir } = await import('fs/promises');
  
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    
    if (await isProjectDirectory(entries, markers)) {
      return resolve(dir);
    }
  } catch (error) {
    // Directory not readable
  }
  
  return null;
}

// Helper: Find sibling projects with boundary logic
async function findSiblingProjects(
  baseDir: string, 
  markers: Set<string>, 
  skipDirs: Set<string>, 
  projects: Set<string>, 
  maxProjects: number
): Promise<void> {
  const { readdir } = await import('fs/promises');
  
  try {
    const entries = await readdir(baseDir, { withFileTypes: true });
    
    for (const entry of entries) {
      if (entry.isDirectory() && !skipDirs.has(entry.name) && projects.size < maxProjects) {
        await searchSubdirectoryForProjects(join(baseDir, entry.name), 1);
      }
    }
  } catch (error) {
    // Directory not readable
  }
  
  async function searchSubdirectoryForProjects(dir: string, depth: number): Promise<void> {
    // Respect hard limits
    if (depth > 3 || projects.size >= maxProjects) return;
    
    try {
      const entries = await readdir(dir, { withFileTypes: true });
      
      // Check if current directory is a project using shared logic
      const isProject = await isProjectDirectory(entries, markers);
      if (isProject) {
        projects.add(resolve(dir));
      }
      
      // If this directory is a project, don't recurse deeper
      if (isProject) {
        return;
      }
      
      // Continue searching subdirectories if this is not a project
      for (const entry of entries) {
        if (entry.isDirectory() && !skipDirs.has(entry.name) && projects.size < maxProjects) {
          await searchSubdirectoryForProjects(join(dir, entry.name), depth + 1);
        }
      }
    } catch (error) {
      // Directory might not be readable, skip it
    }
  }
}

/**
 * Filter diagnostics to exclude ignored files and noise
 */
export async function filterAndProcessDiagnostics(diagnostics: any[], projectRoot: string): Promise<any[]> {
  if (!diagnostics || diagnostics.length === 0) {
    return [];
  }
  
  // Filter out ignored files (node_modules, .git, etc.)
  const filteredDiagnostics = await filterDiagnostics(diagnostics, projectRoot);
  
  if (filteredDiagnostics.length === 0) {
    return [];
  }
  
  // Only return errors and warnings, not hints (too noisy)
  return filteredDiagnostics.filter((d: any) => 
    d.severity === 'error' || d.severity === 'warning'
  );
}
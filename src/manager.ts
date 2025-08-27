#!/usr/bin/env bun

/**
 * Real LSP Manager Script
 * Manages actual Language Server Protocol servers for projects
 */

import { spawn } from "child_process";
import { existsSync, statSync } from "fs";
import { dirname, join, resolve } from "path";
import { createHash } from "crypto";
import { $ } from "bun";
import { logger } from "./utils/logger";
import { TIMEOUTS } from "./constants";

interface ProjectInfo {
  root: string;
  hash: string;
  hasTypeScript: boolean;
  hasPython: boolean;
}

/**
 * Find the project root by looking for marker files
 * Starting from a file path, walks up to find the TOP-LEVEL project root
 * (where .git or .claude exists)
 */
export function findProjectRoot(startPath: string): ProjectInfo | null {
  // Resolve relative paths to absolute
  let currentPath = resolve(startPath);
  
  // Start from file's directory if it's a file
  if (existsSync(currentPath) && !statSync(currentPath).isDirectory()) {
    currentPath = dirname(currentPath);
  }
  
  let foundProject: ProjectInfo | null = null;
  
  // Walk up the directory tree
  while (currentPath !== "/" && currentPath !== ".") {
    let hasTypeScript = false;
    let hasPython = false;
    
    // Check this directory and immediate subdirectories for language markers
    // Check current directory
    hasTypeScript = hasTypeScript || existsSync(join(currentPath, "tsconfig.json")) ||
                    existsSync(join(currentPath, "package.json"));
    
    hasPython = hasPython || existsSync(join(currentPath, "setup.py")) ||
                existsSync(join(currentPath, "pyproject.toml")) ||
                existsSync(join(currentPath, "requirements.txt")) ||
                existsSync(join(currentPath, ".venv")) ||
                existsSync(join(currentPath, "Pipfile"));
    
    // Check subdirectories (like ui/, backend/, etc.)
    const subdirs = ["ui", "frontend", "backend", "api", "web", "server", "client"];
    for (const subdir of subdirs) {
      const subPath = join(currentPath, subdir);
      if (existsSync(subPath)) {
        hasTypeScript = hasTypeScript || 
                       existsSync(join(subPath, "tsconfig.json")) ||
                       existsSync(join(subPath, "package.json"));
        
        hasPython = hasPython || 
                   existsSync(join(subPath, "setup.py")) ||
                   existsSync(join(subPath, "pyproject.toml")) ||
                   existsSync(join(subPath, "requirements.txt"));
      }
    }
    
    // Check for version control markers (indicates project root)
    const hasVersionControl = existsSync(join(currentPath, ".git")) ||
                              existsSync(join(currentPath, ".hg")) ||
                              existsSync(join(currentPath, ".svn"));
    
    // If we found version control, this is likely the project root
    if (hasVersionControl) {
      const hash = createHash("md5").update(currentPath).digest("hex").substring(0, 8);
      return {
        root: currentPath,
        hash,
        hasTypeScript,
        hasPython
      };
    }
    
    // If we found language files but no version control yet, save it
    if ((hasTypeScript || hasPython) && !foundProject) {
      const hash = createHash("md5").update(currentPath).digest("hex").substring(0, 8);
      foundProject = {
        root: currentPath,
        hash,
        hasTypeScript,
        hasPython
      };
    }
    
    // Move up one directory
    const parentPath = dirname(currentPath);
    if (parentPath === currentPath) break; // Reached root
    currentPath = parentPath;
  }
  
  return foundProject;
}

/**
 * Check if LSP server is already running for a project
 */
export async function isLSPRunning(projectHash: string): Promise<boolean> {
  try {
    const socketPath = `/tmp/claude-lsp-${projectHash}.sock`;
    const response = await fetch("http://localhost/health", { 
      unix: socketPath,
      signal: AbortSignal.timeout(1000)
    } as any);
    const data = await response.json() as any;
    return data.status === "ok" && data.type === "real-lsp";
  } catch {
    return false;
  }
}

/**
 * Start LSP server for a project
 */
export async function startLSPServer(projectInfo: ProjectInfo) {
  if (!projectInfo.hasTypeScript && !projectInfo.hasPython) {
    await logger.info(`No supported language files in ${projectInfo.root}`);
    return;
  }
  
  if (await isLSPRunning(projectInfo.hash)) {
    await logger.info(`LSP server already running for ${projectInfo.root}`);
    return;
  }
  
  await logger.info(`Starting real LSP server for ${projectInfo.root}...`);
  await logger.info(`  TypeScript: ${projectInfo.hasTypeScript ? '✅' : '❌'}`);
  await logger.info(`  Python: ${projectInfo.hasPython ? '✅' : '❌'}`);
  
  const serverPath = join(import.meta.dir, "server.ts");
  const child = spawn("bun", [serverPath, projectInfo.root], {
    detached: true,
    stdio: "ignore",
    env: { ...process.env }
  });
  
  child.unref();
  await logger.info(`LSP server started with PID ${child.pid}`);
  
  // Write PID file
  if (child.pid) {
    const pidFile = `/tmp/claude-lsp-${projectInfo.hash}.pid`;
    await Bun.write(pidFile, child.pid.toString());
  }
}

/**
 * Get diagnostics from LSP server
 */
export async function getDiagnostics(projectHash: string, file?: string): Promise<any> {
  try {
    const socketPath = `/tmp/claude-lsp-${projectHash}.sock`;
    const url = file 
      ? `http://localhost/diagnostics?file=${encodeURIComponent(file)}`
      : "http://localhost/diagnostics/all";
    
    const response = await fetch(url, { 
      unix: socketPath,
      signal: AbortSignal.timeout(TIMEOUTS.MANAGER_TIMEOUT_MS)
    } as any);
    
    if (response.ok) {
      return await response.json();
    }
  } catch (e) {
    await logger.error(`Failed to get diagnostics: ${e}`);
  }
  return null;
}

/**
 * Auto-start LSP server for a file when edited
 */
export async function autoStart(filePath: string) {
  const projectInfo = findProjectRoot(filePath);
  
  if (!projectInfo) {
    await logger.info(`No project found for file: ${filePath}`);
    return;
  }
  
  await logger.info(`Found project at: ${projectInfo.root}`);
  
  if (projectInfo.hasTypeScript || projectInfo.hasPython) {
    await startLSPServer(projectInfo);
  } else {
    await logger.info("No supported language files in project");
  }
}

/**
 * Stop LSP server for a project
 */
export async function stopLSPServer(projectInfo: ProjectInfo) {
  const socketPath = `/tmp/claude-lsp-${projectInfo.hash}.sock`;
  const pidFile = `/tmp/claude-lsp-${projectInfo.hash}.pid`;
  
  await logger.info(`Stopping LSP server for ${projectInfo.root}...`);
  
  if (existsSync(pidFile)) {
    const pid = await Bun.file(pidFile).text();
    await $`kill ${pid.trim()}`.quiet();
    await $`rm -f ${pidFile}`.quiet();
    await logger.info(`Killed LSP server process ${pid.trim()}`);
  }
  
  if (existsSync(socketPath)) {
    await $`rm -f ${socketPath}`.quiet();
  }
  
  await logger.info("LSP server stopped");
}
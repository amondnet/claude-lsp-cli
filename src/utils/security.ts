/**
 * Security utilities for Claude Code LSP
 * Provides secure alternatives to common operations
 */

import { relative, resolve, isAbsolute } from "path";
import { spawn, SpawnOptions } from "child_process";
import { createHash, randomBytes } from "crypto";
import { unlink, access, constants } from "fs/promises";
import { existsSync } from "fs";

/**
 * Validates that a file path stays within the specified root directory
 * Prevents path traversal attacks
 */
export function validatePathWithinRoot(rootPath: string, filePath: string): string | null {
  const fullPath = resolve(rootPath, filePath);
  const relativePath = relative(rootPath, fullPath);
  
  // Check if path escapes the root directory
  if (relativePath.startsWith('..') || isAbsolute(relativePath)) {
    return null;
  }
  
  return fullPath;
}

/**
 * Safely execute a command using spawn with proper argument parsing
 * Prevents command injection
 */
export async function safeExecute(
  command: string, 
  args: string[] = [], 
  options: SpawnOptions = {}
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      ...options,
      shell: false // Never use shell to prevent injection
    });
    
    let stdout = '';
    let stderr = '';
    
    child.stdout?.on('data', (data) => {
      stdout += data.toString();
    });
    
    child.stderr?.on('data', (data) => {
      stderr += data.toString();
    });
    
    child.on('error', (error) => {
      reject(new Error(`Failed to execute ${command}: ${error.message}`));
    });
    
    child.on('close', (code) => {
      resolve({
        stdout,
        stderr,
        exitCode: code || 0
      });
    });
  });
}

/**
 * Parse a command string into command and arguments array
 * Handles quoted arguments properly
 */
export function parseCommand(commandString: string): { command: string; args: string[] } {
  const parts: string[] = [];
  let current = '';
  let inQuote = false;
  let quoteChar = '';
  
  for (let i = 0; i < commandString.length; i++) {
    const char = commandString[i];
    
    if (inQuote) {
      if (char === quoteChar) {
        inQuote = false;
        quoteChar = '';
      } else {
        current += char;
      }
    } else if (char === '"' || char === "'") {
      inQuote = true;
      quoteChar = char;
    } else if (char === ' ') {
      if (current) {
        parts.push(current);
        current = '';
      }
    } else {
      current += char;
    }
  }
  
  if (current) {
    parts.push(current);
  }
  
  return {
    command: parts[0] || '',
    args: parts.slice(1)
  };
}

/**
 * Safely kill a process by PID
 * Replaces shell command: kill <pid>
 */
export async function safeKillProcess(pid: number): Promise<boolean> {
  try {
    process.kill(pid, 'SIGTERM');
    // Give process time to terminate gracefully
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Check if still running and force kill if needed
    try {
      process.kill(pid, 0); // Check if process exists
      process.kill(pid, 'SIGKILL'); // Force kill
    } catch {
      // Process already terminated
    }
    
    return true;
  } catch (error: any) {
    if (error.code === 'ESRCH') {
      // Process doesn't exist, consider it a success
      return true;
    }
    throw new Error(`Failed to kill process ${pid}: ${error.message}`);
  }
}

/**
 * Safely delete a file
 * Replaces shell command: rm -f <file>
 */
export async function safeDeleteFile(filePath: string): Promise<boolean> {
  try {
    await unlink(filePath);
    return true;
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      // File doesn't exist, consider it a success
      return true;
    }
    throw new Error(`Failed to delete file ${filePath}: ${error.message}`);
  }
}

/**
 * Generate a secure hash using SHA-256
 * Replaces MD5 hashing
 */
export function secureHash(data: string): string {
  return createHash('sha256').update(data).digest('hex');
}

/**
 * Generate a secure random token for authentication
 */
export function generateSecureToken(length: number = 32): string {
  return randomBytes(length).toString('hex');
}

/**
 * Check if a file/directory exists and is accessible
 */
export async function checkAccess(path: string, mode: number = constants.F_OK): Promise<boolean> {
  try {
    await access(path, mode);
    return true;
  } catch {
    return false;
  }
}

/**
 * Validate and sanitize environment variables
 * Filters out sensitive keys when logging
 */
export function sanitizeEnvForLogging(env: NodeJS.ProcessEnv): Record<string, string> {
  const sanitized: Record<string, string> = {};
  const sensitivePatterns = [
    'KEY', 'TOKEN', 'SECRET', 'PASSWORD', 'AUTH',
    'CREDENTIAL', 'API', 'PRIVATE', 'CERT'
  ];
  
  for (const [key, value] of Object.entries(env)) {
    if (!value) continue;
    
    const isSensitive = sensitivePatterns.some(pattern => 
      key.toUpperCase().includes(pattern)
    );
    
    sanitized[key] = isSensitive ? '***REDACTED***' : value;
  }
  
  return sanitized;
}

/**
 * Create a process cleanup handler
 */
export class ProcessCleanupManager {
  private processes: Map<number, { name: string; pid: number }> = new Map();
  private cleanupHandlers: (() => Promise<void>)[] = [];
  
  constructor() {
    // Register cleanup on process exit
    process.on('exit', () => this.cleanup());
    process.on('SIGINT', () => this.cleanup());
    process.on('SIGTERM', () => this.cleanup());
    process.on('uncaughtException', (error) => {
      console.error('Uncaught exception:', error);
      this.cleanup();
    });
  }
  
  registerProcess(pid: number, name: string): void {
    this.processes.set(pid, { name, pid });
  }
  
  unregisterProcess(pid: number): void {
    this.processes.delete(pid);
  }
  
  addCleanupHandler(handler: () => Promise<void>): void {
    this.cleanupHandlers.push(handler);
  }
  
  async cleanup(): Promise<void> {
    // Kill all registered processes
    for (const [pid, info] of this.processes) {
      try {
        console.log(`Cleaning up process ${info.name} (PID: ${pid})`);
        await safeKillProcess(pid);
      } catch (error) {
        console.error(`Failed to cleanup process ${info.name}:`, error);
      }
    }
    
    // Run additional cleanup handlers
    for (const handler of this.cleanupHandlers) {
      try {
        await handler();
      } catch (error) {
        console.error('Cleanup handler failed:', error);
      }
    }
    
    this.processes.clear();
    this.cleanupHandlers = [];
  }
}

// Export a singleton instance
export const cleanupManager = new ProcessCleanupManager();
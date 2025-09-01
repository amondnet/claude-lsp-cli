/**
 * CLI Server Manager
 * 
 * Manages the lifecycle of claude-lsp-server instances.
 * Handles starting, stopping, and health checking servers.
 */

import { spawn } from "child_process";
import { existsSync } from "fs";
import { join } from "path";
import { secureHash } from "./utils/security";
import { ServerRegistry } from "./utils/server-registry";
import { logger } from "./utils/logger";

// Track servers being started to prevent race conditions
const startingServers = new Map<string, Promise<string>>();

/**
 * Check if a server is running for a project
 */
export async function isServerRunning(projectRoot: string): Promise<boolean> {
  // Use global server for all projects (disabled for tests)
  const USE_GLOBAL = process.env.CLAUDE_LSP_GLOBAL_MODE === 'true';
  const projectHash = USE_GLOBAL ? "global" : secureHash(projectRoot).substring(0, 16);
  
  // Use same socket directory as server
  const socketDir = process.env.XDG_RUNTIME_DIR || 
                   (process.platform === 'darwin' 
                     ? `${process.env.HOME}/Library/Application Support/claude-lsp/run`
                     : `${process.env.HOME}/.claude-lsp/run`);
  const socketPath = `${socketDir}/claude-lsp-${projectHash}.sock`;
  
  try {
    const response = await fetch('http://localhost/health', {
      // @ts-ignore - Bun supports unix option
      unix: socketPath,
      signal: AbortSignal.timeout(2000)
    });
    
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Ensure server is running for a project
 */
export async function ensureServerRunning(projectRoot: string): Promise<string> {
  // Use global server for all projects (disabled for tests)
  const USE_GLOBAL = process.env.CLAUDE_LSP_GLOBAL_MODE === 'true';
  const projectHash = USE_GLOBAL ? "global" : secureHash(projectRoot).substring(0, 16);
  const serverProjectRoot = USE_GLOBAL ? "GLOBAL" : projectRoot;
  
  // Check if server is already being started
  const existingStart = startingServers.get(projectHash);
  if (existingStart) {
    return await existingStart;
  }
  
  // Use same socket directory as server
  const socketDir = process.env.XDG_RUNTIME_DIR || 
                   (process.platform === 'darwin' 
                     ? `${process.env.HOME}/Library/Application Support/claude-lsp/run`
                     : `${process.env.HOME}/.claude-lsp/run`);
  const socketPath = `${socketDir}/claude-lsp-${projectHash}.sock`;
  const registry = ServerRegistry.getInstance();
  
  // Check registry first
  const existingServer = registry.getServerByPath(serverProjectRoot);
  
  if (existingServer) {
    // Ping to verify it's actually running
    const running = await isServerRunning(projectRoot);
    
    if (running) {
      // Update heartbeat
      registry.updateHeartbeat(projectHash);
      return socketPath;
    }
    
    // Server in registry but not responding - clean up
    registry.markServerStopped(projectHash);
  }
  
  // Create the startup promise to prevent race conditions
  const startupPromise = startNewServer(serverProjectRoot, projectHash, socketPath);
  startingServers.set(projectHash, startupPromise);
  
  try {
    const result = await startupPromise;
    return result;
  } finally {
    // Clean up the promise from tracking
    startingServers.delete(projectHash);
  }
}

/**
 * Enforce max server limit by stopping oldest servers
 */
async function enforceMaxServers(maxServers: number = 3): Promise<void> {
  const registry = ServerRegistry.getInstance();
  const servers = registry.getAllActiveServers();
  
  if (servers.length >= maxServers) {
    // Sort by last_response (oldest first)
    const sortedServers = servers.sort((a, b) => 
      new Date(a.last_response).getTime() - new Date(b.last_response).getTime()
    );
    
    // Stop oldest servers to make room
    const toStop = sortedServers.slice(0, servers.length - maxServers + 1);
    for (const server of toStop) {
      await stopServerQuiet(server.project_root);
    }
  }
}

/**
 * Start a new server process
 */
async function startNewServer(projectRoot: string, projectHash: string, socketPath: string): Promise<string> {
  const registry = ServerRegistry.getInstance();
  
  // Don't enforce max servers in global mode - there's only one  
  const USE_GLOBAL = process.env.CLAUDE_LSP_GLOBAL_MODE === 'true';
  if (!USE_GLOBAL) {
    // Enforce max server limit before starting new one
    const MAX_SERVERS = parseInt(process.env.CLAUDE_LSP_MAX_SERVERS || '3');
    await enforceMaxServers(MAX_SERVERS);
  }
  
  // Start new server
  const serverPath = findServerBinary();
  if (!serverPath) {
    throw new Error('claude-lsp-server binary not found');
  }
  
  const child = spawn(serverPath, [projectRoot], {
    stdio: 'ignore',
    detached: true
  });
  
  child.unref();
  
  // Register in SQLite
  const startTime = new Date().toISOString();
  registry.registerServer(projectRoot, [], child.pid!, socketPath);
  
  // Wait for server to be ready
  const maxWait = parseInt(process.env.CLAUDE_LSP_STARTUP_TIMEOUT || '10000'); // 10 seconds default, configurable
  const startWait = Date.now();
  
  while (Date.now() - startWait < maxWait) {
    if (await isServerRunning(projectRoot)) {
      return socketPath;
    }
    await new Promise(resolve => setTimeout(resolve, 200)); // Check more frequently
  }
  
  // Timeout - clean up
  registry.markServerStopped(projectHash);
  
  // Kill the child process if it's still running
  try {
    if (child.pid) {
      process.kill(child.pid, 'SIGKILL');
    }
  } catch (error) {
    // Process might already be dead
  }
  
  throw new Error(`Server startup timeout after ${maxWait}ms. Check if language servers are properly installed.`);
}

/**
 * Find the server binary
 */
function findServerBinary(): string | null {
  const possiblePaths = [
    join(import.meta.dir, '..', 'bin', 'claude-lsp-server'),
    join(process.env.HOME || '', '.claude', 'claude-code-lsp', 'bin', 'claude-lsp-server'),
    '/Users/steven_chong/Downloads/repos/claude-code-lsp/bin/claude-lsp-server',
  ];
  
  for (const path of possiblePaths) {
    if (existsSync(path)) {
      return path;
    }
  }
  
  return null;
}

/**
 * Start a server for a project
 */
export async function startServer(projectRoot: string): Promise<void> {
  const projectHash = secureHash(projectRoot).substring(0, 16);
  const registry = ServerRegistry.getInstance();
  
  // Check if already running
  if (await isServerRunning(projectRoot)) {
    console.log(`✅ Server already running for: ${projectRoot}`);
    return;
  }
  
  console.log(`Starting LSP server for: ${projectRoot}`);
  
  try {
    const socketPath = await ensureServerRunning(projectRoot);
    console.log(`✅ Server started successfully`);
    console.log(`   Socket: ${socketPath}`);
    console.log(`   Hash: ${projectHash}`);
  } catch (error) {
    console.error(`❌ Failed to start server: ${error}`);
    throw error;
  }
}

/**
 * Stop a server for a project (quiet version for auto-cleanup)
 */
async function stopServerQuiet(projectRoot: string): Promise<void> {
  const projectHash = secureHash(projectRoot).substring(0, 16);
  const registry = ServerRegistry.getInstance();
  
  const server = registry.getServerByPath(projectRoot);
  if (!server) {
    return;
  }
  
  // Try graceful shutdown first
  try {
    const response = await fetch('http://localhost/shutdown', {
      method: 'POST',
      // @ts-ignore - Bun supports unix option
      unix: server.socket_path,
      signal: AbortSignal.timeout(3000)
    });
    
    if (response.ok) {
      registry.markServerStopped(projectHash);
      return;
    }
  } catch {
    // Graceful shutdown failed
  }
  
  // Force kill
  try {
    process.kill(server.pid, 'SIGKILL');
  } catch (error) {
    // Process may have already exited
  }
  
  registry.markServerStopped(projectHash);
}

/**
 * Stop a server for a project
 */
export async function stopServer(projectRoot: string): Promise<void> {
  const projectHash = secureHash(projectRoot).substring(0, 16);
  const registry = ServerRegistry.getInstance();
  
  const server = registry.getServerByPath(projectRoot);
  if (!server) {
    console.log(`No server running for: ${projectRoot}`);
    return;
  }
  
  console.log(`Stopping server for: ${projectRoot}`);
  console.log(`   PID: ${server.pid}`);
  
  // Try graceful shutdown first
  try {
    const response = await fetch('http://localhost/shutdown', {
      method: 'POST',
      // @ts-ignore - Bun supports unix option
      unix: server.socket_path,
      signal: AbortSignal.timeout(3000)
    });
    
    if (response.ok) {
      console.log("✅ Server shutdown gracefully");
      registry.markServerStopped(projectHash);
      return;
    }
  } catch {
    // Graceful shutdown failed
  }
  
  // Force kill
  try {
    process.kill(server.pid, 'SIGKILL');
    console.log("✅ Server forcefully terminated");
  } catch (error) {
    console.log("⚠️ Server process may have already exited");
  }
  
  registry.markServerStopped(projectHash);
}

/**
 * Stop all running servers
 */
export async function stopAllServers(): Promise<void> {
  const registry = ServerRegistry.getInstance();
  const servers = registry.getAllActiveServers();
  
  if (servers.length === 0) {
    console.log("No active servers to stop");
    return;
  }
  
  console.log(`Stopping ${servers.length} server(s)...`);
  
  for (const server of servers) {
    await stopServer(server.project_root);
  }
  
  // Clean up dead entries
  const deadCount = await registry.cleanupDeadServers();
  if (deadCount > 0) {
    console.log(`Cleaned up ${deadCount} dead server entries`);
  }
}

/**
 * Stop idle servers
 */
export async function stopIdleServers(idleMinutes: number): Promise<void> {
  const registry = ServerRegistry.getInstance();
  const servers = registry.getAllActiveServers();
  
  const idleMs = idleMinutes * 60 * 1000;
  const now = Date.now();
  let stoppedCount = 0;
  
  for (const server of servers) {
    const lastResponse = new Date(server.last_response).getTime();
    const idleTime = now - lastResponse;
    
    if (idleTime > idleMs) {
      console.log(`Stopping idle server: ${server.project_root}`);
      console.log(`   Idle for: ${Math.floor(idleTime / 60000)} minutes`);
      await stopServer(server.project_root);
      stoppedCount++;
    }
  }
  
  // Only log if we actually stopped something
  if (stoppedCount > 0) {
    console.log(`✅ Stopped ${stoppedCount} idle server(s)`);
  }
  // Don't log when nothing was stopped to avoid noise in hook output
}

/**
 * Show status of servers
 */
export async function showServerStatus(projectRoot?: string): Promise<void> {
  const registry = ServerRegistry.getInstance();
  
  // Clean up dead servers first
  await registry.cleanupDeadServers();
  
  if (projectRoot) {
    // Show status for specific project
    const server = registry.getServerByPath(projectRoot);
    if (!server) {
      console.log(`No server registered for: ${projectRoot}`);
      return;
    }
    
    const running = await isServerRunning(projectRoot);
    console.log(`Project: ${projectRoot}`);
    console.log(`   Status: ${running ? '🟢 Running' : '🔴 Not responding'}`);
    console.log(`   PID: ${server.pid}`);
    console.log(`   Socket: ${server.socket_path}`);
    console.log(`   Started: ${server.start_time}`);
    console.log(`   Last response: ${server.last_response}`);
  } else {
    // Show all servers
    const servers = registry.getAllActiveServers();
    
    if (servers.length === 0) {
      console.log("No active servers");
      return;
    }
    
    console.log(`Active servers: ${servers.length}`);
    console.log("");
    
    for (const server of servers) {
      const running = await isServerRunning(server.project_root);
      console.log(`📁 ${server.project_root}`);
      console.log(`   Status: ${running ? '🟢 Running' : '🔴 Not responding'}`);
      console.log(`   PID: ${server.pid}`);
      console.log("");
    }
    
    // Show statistics
    const stats = registry.getStatistics();
    console.log("Statistics:");
    console.log(`   Total servers: ${stats.total_servers}`);
    console.log(`   Running: ${stats.running_servers}`);
    console.log(`   Starting: ${stats.starting_servers}`);
    console.log(`   Unhealthy: ${stats.unhealthy_servers}`);
  }
}

/**
 * Reset deduplication for a project
 */
export async function resetDeduplication(projectRoot: string): Promise<void> {
  const projectHash = secureHash(projectRoot).substring(0, 16);
  
  // Use same socket directory as server
  const socketDir = process.env.XDG_RUNTIME_DIR || 
                   (process.platform === 'darwin' 
                     ? `${process.env.HOME}/Library/Application Support/claude-lsp/run`
                     : `${process.env.HOME}/.claude-lsp/run`);
  const socketPath = `${socketDir}/claude-lsp-${projectHash}.sock`;
  
  try {
    const response = await fetch('http://localhost/reset-dedup', {
      method: 'POST',
      // @ts-ignore - Bun supports unix option
      unix: socketPath,
      signal: AbortSignal.timeout(5000)
    });
    
    if (response.ok) {
      const result = await response.json();
      console.log(`✅ ${result.message}`);
    } else {
      console.error("❌ Failed to reset deduplication");
    }
  } catch (error) {
    console.error("❌ Server not responding or not running");
  }
}